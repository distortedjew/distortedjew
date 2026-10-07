use crate::config::Config;
use crate::dex::raydium::{raydium_authority, raydium_cp_authority};
use crate::kamino::{
    get_kamino_flashloan_borrow_ix, get_kamino_flashloan_repay_ix, KAMINO_FLASHLOAN_AMOUNT,
};
use crate::pools::MintPoolData;
use crate::quote::token_account_amount;
use solana_account_decoder::UiAccountEncoding;
use solana_client::nonblocking::rpc_client::RpcClient as NonblockingRpcClient;
use solana_client::rpc_config::{
    RpcSendTransactionConfig, RpcSimulateTransactionAccountsConfig, RpcSimulateTransactionConfig,
};
use solana_program::instruction::Instruction;
use solana_sdk::account::Account;
use solana_sdk::address_lookup_table::AddressLookupTableAccount;
use solana_sdk::commitment_config::{CommitmentConfig, CommitmentLevel};
use solana_sdk::compute_budget::ComputeBudgetInstruction;
use solana_sdk::hash::Hash;
use solana_sdk::message::v0::Message;
use solana_sdk::signature::{Keypair, Signature};
use solana_sdk::signer::Signer;
use solana_sdk::system_instruction;
use solana_sdk::transaction::VersionedTransaction;
use std::sync::Arc;
use tracing::{debug, error};

use crate::constants::sol_mint;
use crate::dex::dlmm::constants::{dlmm_event_authority, dlmm_program_id};
use crate::dex::pump::constants::{pump_fee_wallet, pump_program_id};
use crate::dex::raydium::constants::{
    raydium_clmm_program_id, raydium_cp_program_id, raydium_program_id,
};
use crate::dex::whirlpool::constants::whirlpool_program_id;
use solana_program::instruction::AccountMeta;
use solana_program::pubkey::Pubkey;
use solana_program::system_program;
use spl_associated_token_account::ID as associated_token_program_id;
use spl_token::ID as token_program_id;
use std::str::FromStr;

pub struct TxParams {
    pub compute_unit_limit: u32,
    pub compute_unit_price: u64,
    /// Passed to the executor program, which reverts below this profit.
    pub minimum_profit: u64,
    /// Jito tip account and amount, appended as the last instruction.
    pub tip: Option<(Pubkey, u64)>,
}

const LAMPORTS_PER_SIGNATURE: u64 = 5_000;

/// Base fee plus priority fee for a single-signature transaction.
pub fn estimate_network_fee(compute_unit_limit: u32, compute_unit_price: u64) -> u64 {
    let priority = (compute_unit_limit as u128 * compute_unit_price as u128 + 999_999) / 1_000_000;
    LAMPORTS_PER_SIGNATURE + priority as u64
}

pub fn build_transaction(
    wallet_kp: &Keypair,
    config: &Config,
    mint_pool_data: &MintPoolData,
    blockhash: Hash,
    address_lookup_table_accounts: &[AddressLookupTableAccount],
    params: TxParams,
) -> anyhow::Result<VersionedTransaction> {
    let kamino = config.kamino_flashloan.as_ref().filter(|k| k.enabled);

    let mut instructions = vec![
        // A small random offset keeps otherwise identical attempts unique.
        ComputeBudgetInstruction::set_compute_unit_limit(
            params.compute_unit_limit + rand::random::<u32>() % 1000,
        ),
        ComputeBudgetInstruction::set_compute_unit_price(params.compute_unit_price),
    ];

    let swap_ix = create_swap_instruction(wallet_kp, mint_pool_data, params.minimum_profit)?;

    if let Some(k) = kamino {
        let amount = k.amount_lamports.unwrap_or(KAMINO_FLASHLOAN_AMOUNT);
        debug!("Adding Kamino flashloan of {} lamports", amount);
        instructions.push(get_kamino_flashloan_borrow_ix(
            &wallet_kp.pubkey(),
            mint_pool_data.wallet_wsol_account,
            amount,
        )?);
        instructions.push(swap_ix);
        instructions.push(get_kamino_flashloan_repay_ix(
            &wallet_kp.pubkey(),
            mint_pool_data.wallet_wsol_account,
            2, // Borrow instruction index, after the two compute budget instructions
            amount,
        )?);
    } else {
        instructions.push(swap_ix);
    }

    if let Some((tip_account, lamports)) = params.tip {
        instructions.push(system_instruction::transfer(
            &wallet_kp.pubkey(),
            &tip_account,
            lamports,
        ));
    }

    let message = Message::try_compile(
        &wallet_kp.pubkey(),
        &instructions,
        address_lookup_table_accounts,
        blockhash,
    )?;

    Ok(VersionedTransaction::try_new(
        solana_sdk::message::VersionedMessage::V0(message),
        &[wallet_kp],
    )?)
}

#[derive(Debug, Clone)]
pub struct SimSuccess {
    /// Wallet WSOL balance after the simulated transaction.
    pub wsol_after: u64,
    pub units_consumed: Option<u64>,
}

/// Simulates `tx` against current chain state. The outer error is an RPC
/// failure; the inner `Err` is the transaction's own failure with its last logs.
pub async fn simulate(
    rpc: &NonblockingRpcClient,
    tx: &VersionedTransaction,
    wsol_account: &Pubkey,
) -> anyhow::Result<Result<SimSuccess, String>> {
    let result = rpc
        .simulate_transaction_with_config(
            tx,
            RpcSimulateTransactionConfig {
                sig_verify: false,
                replace_recent_blockhash: true,
                commitment: Some(CommitmentConfig::processed()),
                accounts: Some(RpcSimulateTransactionAccountsConfig {
                    encoding: Some(UiAccountEncoding::Base64),
                    addresses: vec![wsol_account.to_string()],
                }),
                ..Default::default()
            },
        )
        .await?
        .value;

    if let Some(err) = result.err {
        let logs = result.logs.unwrap_or_default();
        let tail = logs[logs.len().saturating_sub(3)..].join(" | ");
        return Ok(Err(format!("{:?} {}", err, tail)));
    }

    let wsol_after = result
        .accounts
        .and_then(|accounts| accounts.into_iter().next().flatten())
        .and_then(|ui| ui.decode::<Account>())
        .and_then(|account| token_account_amount(&account.data))
        .ok_or_else(|| anyhow::anyhow!("simulation did not return the WSOL account"))?;

    Ok(Ok(SimSuccess {
        wsol_after,
        units_consumed: result.units_consumed,
    }))
}

/// Sends through every RPC endpoint; returns the signatures that were accepted.
pub async fn send_via_rpc(
    rpc_clients: &[Arc<NonblockingRpcClient>],
    tx: &VersionedTransaction,
    max_retries: usize,
) -> Vec<Signature> {
    let config = RpcSendTransactionConfig {
        skip_preflight: true,
        max_retries: Some(max_retries),
        preflight_commitment: Some(CommitmentLevel::Confirmed),
        ..Default::default()
    };
    let sends = rpc_clients
        .iter()
        .map(|client| client.send_transaction_with_config(tx, config));
    let mut signatures = Vec::new();
    for (i, result) in futures::future::join_all(sends)
        .await
        .into_iter()
        .enumerate()
    {
        match result {
            Ok(sig) => signatures.push(sig),
            Err(e) => error!("Failed to send transaction through RPC client {}: {}", i, e),
        }
    }
    signatures
}

// See https://docs.solanamevbot.com/home/onchain-bot/onchain-program for more information
fn create_swap_instruction(
    wallet_kp: &Keypair,
    mint_pool_data: &MintPoolData,
    minimum_profit: u64,
) -> anyhow::Result<Instruction> {
    debug!("Creating swap instruction for all DEX types");

    let executor_program_id =
        Pubkey::from_str("MEViEnscUm6tsQRoGd9h6nLQaQspKj7DB2M5FwM3Xvz").unwrap();
    let fee_collector = Pubkey::from_str("6AGB9kqgSp2mQXwYpdrV4QVV8urvCaDS35U1wsLssy6H").unwrap();

    let pump_global_config =
        Pubkey::from_str("ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw").unwrap();
    let pump_authority = Pubkey::from_str("GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR").unwrap();

    let wallet = wallet_kp.pubkey();
    let sol_mint_pubkey = sol_mint();
    let wallet_sol_account = mint_pool_data.wallet_wsol_account;

    let mut accounts = vec![
        AccountMeta::new_readonly(wallet, true), // 0. Wallet (signer)
        AccountMeta::new_readonly(sol_mint_pubkey, false), // 1. SOL mint
        AccountMeta::new(fee_collector, false),  // 2. Fee collector
        AccountMeta::new(wallet_sol_account, false), // 3. Wallet SOL account
        AccountMeta::new_readonly(token_program_id, false), // 4. Token program
        AccountMeta::new_readonly(system_program::ID, false), // 5. System program
        AccountMeta::new_readonly(associated_token_program_id, false), // 6. Associated Token program
    ];

    accounts.push(AccountMeta::new_readonly(mint_pool_data.mint, false));
    let wallet_x_account =
        spl_associated_token_account::get_associated_token_address(&wallet, &mint_pool_data.mint);
    accounts.push(AccountMeta::new(wallet_x_account, false));

    for pool in &mint_pool_data.raydium_pools {
        accounts.push(AccountMeta::new_readonly(raydium_program_id(), false));
        accounts.push(AccountMeta::new_readonly(raydium_authority(), false)); // Raydium authority
        accounts.push(AccountMeta::new(pool.pool, false));
        accounts.push(AccountMeta::new(pool.token_vault, false));
        accounts.push(AccountMeta::new(pool.sol_vault, false));
    }

    for pool in &mint_pool_data.raydium_cp_pools {
        accounts.push(AccountMeta::new_readonly(raydium_cp_program_id(), false));
        accounts.push(AccountMeta::new_readonly(raydium_cp_authority(), false)); // Raydium CP authority
        accounts.push(AccountMeta::new(pool.pool, false));
        accounts.push(AccountMeta::new_readonly(pool.amm_config, false));
        accounts.push(AccountMeta::new(pool.token_vault, false));
        accounts.push(AccountMeta::new(pool.sol_vault, false));
        accounts.push(AccountMeta::new(pool.observation, false));
    }

    for pool in &mint_pool_data.pump_pools {
        accounts.push(AccountMeta::new_readonly(pump_program_id(), false));
        accounts.push(AccountMeta::new_readonly(pump_global_config, false));
        accounts.push(AccountMeta::new_readonly(pump_authority, false));
        accounts.push(AccountMeta::new_readonly(pump_fee_wallet(), false));
        accounts.push(AccountMeta::new_readonly(pool.pool, false));
        accounts.push(AccountMeta::new(pool.token_vault, false));
        accounts.push(AccountMeta::new(pool.sol_vault, false));
        accounts.push(AccountMeta::new(pool.fee_token_wallet, false));
    }

    for pair in &mint_pool_data.dlmm_pairs {
        accounts.push(AccountMeta::new_readonly(dlmm_program_id(), false));
        accounts.push(AccountMeta::new(dlmm_event_authority(), false)); // DLMM event authority
        accounts.push(AccountMeta::new(pair.pair, false));
        accounts.push(AccountMeta::new(pair.token_vault, false));
        accounts.push(AccountMeta::new(pair.sol_vault, false));
        accounts.push(AccountMeta::new(pair.oracle, false));
        for bin_array in &pair.bin_arrays {
            accounts.push(AccountMeta::new(*bin_array, false));
        }
    }

    for pool in &mint_pool_data.whirlpool_pools {
        accounts.push(AccountMeta::new_readonly(whirlpool_program_id(), false));
        accounts.push(AccountMeta::new(pool.pool, false));
        accounts.push(AccountMeta::new(pool.oracle, false));
        accounts.push(AccountMeta::new(pool.x_vault, false));
        accounts.push(AccountMeta::new(pool.y_vault, false));
        for tick_array in &pool.tick_arrays {
            accounts.push(AccountMeta::new(*tick_array, false));
        }
    }

    for pool in &mint_pool_data.raydium_clmm_pools {
        accounts.push(AccountMeta::new_readonly(raydium_clmm_program_id(), false));
        accounts.push(AccountMeta::new(pool.pool, false));
        accounts.push(AccountMeta::new_readonly(pool.amm_config, false));
        accounts.push(AccountMeta::new(pool.observation_state, false));
        accounts.push(AccountMeta::new(pool.x_vault, false));
        accounts.push(AccountMeta::new(pool.y_vault, false));
        for tick_array in &pool.tick_arrays {
            accounts.push(AccountMeta::new(*tick_array, false));
        }
    }

    let mut data = vec![14u8];

    let max_bin_to_process: u64 = 20;

    data.extend_from_slice(&minimum_profit.to_le_bytes());
    data.extend_from_slice(&max_bin_to_process.to_le_bytes());

    Ok(Instruction {
        program_id: executor_program_id,
        accounts,
        data,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_fee_includes_priority_rounded_up() {
        assert_eq!(estimate_network_fee(200_000, 0), 5_000);
        // 200k CU * 1000 micro-lamports = 200 lamports
        assert_eq!(estimate_network_fee(200_000, 1_000), 5_200);
        // 1 CU * 1 micro-lamport rounds up to 1 lamport
        assert_eq!(estimate_network_fee(1, 1), 5_001);
    }
}

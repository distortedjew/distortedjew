//! Cheap pre-filter run before every simulation.
//!
//! For each configured pool we read the marginal price of the mint in SOL and
//! the pool's swap fee, then look for a pair of pools where buying in one and
//! selling in the other beats both fees. A positive marginal spread is a
//! necessary condition for any profitable trade size, so skipping candidates
//! without one never skips a real opportunity; it only saves RPC calls. The
//! simulation in `bot.rs` is the real profit gate.
//!
//! Fees are lower bounds (DLMM variable fee and Pump creator fee are ignored)
//! so the filter errs towards letting candidates through.

use crate::constants::sol_mint;
use crate::dex::dlmm::dlmm_info::DlmmInfo;
use crate::dex::raydium::PoolState;
use crate::dex::whirlpool::state::Whirlpool;
use crate::pools::MintPoolData;
use anyhow::{anyhow, Context};
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::account::Account;
use solana_sdk::pubkey::Pubkey;

const RAYDIUM_AMM_FEE: f64 = 0.0025;
const PUMP_AMM_FEE: f64 = 0.0025;
const FEE_RATE_DENOMINATOR: f64 = 1_000_000.0;
const DLMM_FEE_PRECISION: f64 = 1_000_000_000.0;
const MAX_ACCOUNTS_PER_CALL: usize = 100;

#[derive(Debug, Clone)]
pub struct PoolPrice {
    pub label: String,
    /// Lamports paid per raw (smallest-unit) token at the margin.
    pub lamports_per_token: f64,
    /// Swap fee as a fraction, e.g. 0.0025.
    pub fee: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Spread {
    pub buy: usize,
    pub sell: usize,
    pub bps: f64,
}

/// Best fee-adjusted round trip: buy the mint in `buy`, sell it in `sell`.
pub fn best_spread(prices: &[PoolPrice]) -> Option<Spread> {
    let mut best: Option<Spread> = None;
    for (i, buy) in prices.iter().enumerate() {
        for (j, sell) in prices.iter().enumerate() {
            if i == j
                || !valid_price(buy.lamports_per_token)
                || !valid_price(sell.lamports_per_token)
            {
                continue;
            }
            let ratio = sell.lamports_per_token * (1.0 - buy.fee) * (1.0 - sell.fee)
                / buy.lamports_per_token;
            let bps = (ratio - 1.0) * 10_000.0;
            if best.as_ref().map_or(true, |b| bps > b.bps) {
                best = Some(Spread {
                    buy: i,
                    sell: j,
                    bps,
                });
            }
        }
    }
    best
}

fn valid_price(p: f64) -> bool {
    p.is_finite() && p > 0.0
}

/// Token1-per-token0 price (raw units) from a Q64.64 square-root price.
pub fn sqrt_price_x64_to_price(sqrt_price_x64: u128) -> f64 {
    let sqrt = sqrt_price_x64 as f64 / 2f64.powi(64);
    sqrt * sqrt
}

/// Y-per-X price (raw units) of a Meteora DLMM bin.
pub fn dlmm_price(active_id: i32, bin_step: u16) -> f64 {
    (1.0 + bin_step as f64 / 10_000.0).powi(active_id)
}

/// Converts a B-per-A pool price into lamports per raw token.
fn lamports_per_token(b_per_a: f64, sol_is_a: bool) -> f64 {
    if sol_is_a {
        1.0 / b_per_a
    } else {
        b_per_a
    }
}

/// `amount` field of an SPL token (or Token-2022) account.
pub fn token_account_amount(data: &[u8]) -> Option<u64> {
    data.get(64..72)
        .map(|b| u64::from_le_bytes(b.try_into().unwrap()))
}

fn read_u64(data: &[u8], offset: usize) -> anyhow::Result<u64> {
    let bytes = data
        .get(offset..offset + 8)
        .ok_or_else(|| anyhow!("account too short to read u64 at {}", offset))?;
    Ok(u64::from_le_bytes(bytes.try_into()?))
}

fn read_u32(data: &[u8], offset: usize) -> anyhow::Result<u32> {
    let bytes = data
        .get(offset..offset + 4)
        .ok_or_else(|| anyhow!("account too short to read u32 at {}", offset))?;
    Ok(u32::from_le_bytes(bytes.try_into()?))
}

/// Raydium CP-Swap AmmConfig: disc(8) bump(1) disable_create_pool(1) index(2) trade_fee_rate(u64)
fn raydium_cp_fee(amm_config: &[u8]) -> anyhow::Result<f64> {
    Ok(read_u64(amm_config, 12)? as f64 / FEE_RATE_DENOMINATOR)
}

/// Raydium CLMM AmmConfig: disc(8) bump(1) index(2) owner(32) protocol_fee_rate(u32) trade_fee_rate(u32)
fn raydium_clmm_fee(amm_config: &[u8]) -> anyhow::Result<f64> {
    Ok(read_u32(amm_config, 47)? as f64 / FEE_RATE_DENOMINATOR)
}

#[derive(Debug, Clone)]
enum Entry {
    /// Constant-product pool priced from its two vault balances.
    Vaults {
        label: String,
        token_vault: Pubkey,
        sol_vault: Pubkey,
        fee: f64,
    },
    Whirlpool {
        label: String,
        pool: Pubkey,
    },
    RaydiumClmm {
        label: String,
        pool: Pubkey,
        fee: f64,
    },
    Dlmm {
        label: String,
        pair: Pubkey,
    },
}

/// Static per-mint quoting setup; rebuilt whenever pool data is refreshed.
#[derive(Debug, Clone)]
pub struct Quoter {
    entries: Vec<Entry>,
    wsol_account: Pubkey,
}

#[derive(Debug, Clone)]
pub struct Snapshot {
    pub prices: Vec<PoolPrice>,
    /// Wallet WSOL balance at snapshot time; the baseline for simulated profit.
    pub wsol_balance: u64,
}

fn short(pk: &Pubkey) -> String {
    let s = pk.to_string();
    s[..6.min(s.len())].to_string()
}

impl Quoter {
    pub async fn new(rpc: &RpcClient, data: &MintPoolData) -> anyhow::Result<Self> {
        let mut entries = Vec::new();

        for p in &data.raydium_pools {
            entries.push(Entry::Vaults {
                label: format!("raydium:{}", short(&p.pool)),
                token_vault: p.token_vault,
                sol_vault: p.sol_vault,
                fee: RAYDIUM_AMM_FEE,
            });
        }
        for p in &data.raydium_cp_pools {
            let config = rpc
                .get_account(&p.amm_config)
                .await
                .with_context(|| format!("fetching Raydium CP amm config {}", p.amm_config))?;
            entries.push(Entry::Vaults {
                label: format!("raydium_cp:{}", short(&p.pool)),
                token_vault: p.token_vault,
                sol_vault: p.sol_vault,
                fee: raydium_cp_fee(&config.data)?,
            });
        }
        for p in &data.pump_pools {
            entries.push(Entry::Vaults {
                label: format!("pump:{}", short(&p.pool)),
                token_vault: p.token_vault,
                sol_vault: p.sol_vault,
                fee: PUMP_AMM_FEE,
            });
        }
        for p in &data.whirlpool_pools {
            entries.push(Entry::Whirlpool {
                label: format!("whirlpool:{}", short(&p.pool)),
                pool: p.pool,
            });
        }
        for p in &data.raydium_clmm_pools {
            let config = rpc
                .get_account(&p.amm_config)
                .await
                .with_context(|| format!("fetching Raydium CLMM amm config {}", p.amm_config))?;
            entries.push(Entry::RaydiumClmm {
                label: format!("raydium_clmm:{}", short(&p.pool)),
                pool: p.pool,
                fee: raydium_clmm_fee(&config.data)?,
            });
        }
        for p in &data.dlmm_pairs {
            entries.push(Entry::Dlmm {
                label: format!("dlmm:{}", short(&p.pair)),
                pair: p.pair,
            });
        }

        Ok(Self {
            entries,
            wsol_account: data.wallet_wsol_account,
        })
    }

    pub fn pool_count(&self) -> usize {
        self.entries.len()
    }

    fn accounts(&self) -> Vec<Pubkey> {
        let mut keys = vec![self.wsol_account];
        for e in &self.entries {
            match e {
                Entry::Vaults {
                    token_vault,
                    sol_vault,
                    ..
                } => {
                    keys.push(*token_vault);
                    keys.push(*sol_vault);
                }
                Entry::Whirlpool { pool, .. } | Entry::RaydiumClmm { pool, .. } => keys.push(*pool),
                Entry::Dlmm { pair, .. } => keys.push(*pair),
            }
        }
        keys
    }

    pub async fn snapshot(&self, rpc: &RpcClient) -> anyhow::Result<Snapshot> {
        let keys = self.accounts();
        let mut accounts: Vec<Option<Account>> = Vec::with_capacity(keys.len());
        for chunk in keys.chunks(MAX_ACCOUNTS_PER_CALL) {
            accounts.extend(rpc.get_multiple_accounts(chunk).await?);
        }
        let mut it = accounts.into_iter();

        // A missing WSOL account means no balance yet; simulations will fail
        // and say so, which is more useful than refusing to quote.
        let wsol_balance = it
            .next()
            .flatten()
            .and_then(|a| token_account_amount(&a.data))
            .unwrap_or(0);

        let mut prices = Vec::with_capacity(self.entries.len());
        for e in &self.entries {
            let price = match e {
                Entry::Vaults { label, fee, .. } => {
                    let token = it.next().flatten();
                    let sol = it.next().flatten();
                    let token_amount = token.and_then(|a| token_account_amount(&a.data));
                    let sol_amount = sol.and_then(|a| token_account_amount(&a.data));
                    match (token_amount, sol_amount) {
                        (Some(t), Some(s)) if t > 0 => Some(PoolPrice {
                            label: label.clone(),
                            lamports_per_token: s as f64 / t as f64,
                            fee: *fee,
                        }),
                        _ => None,
                    }
                }
                Entry::Whirlpool { label, .. } => it.next().flatten().and_then(|a| {
                    let w = Whirlpool::try_deserialize(&a.data).ok()?;
                    let sol_is_a = w.token_mint_a == sol_mint();
                    Some(PoolPrice {
                        label: label.clone(),
                        lamports_per_token: lamports_per_token(
                            sqrt_price_x64_to_price(w.sqrt_price),
                            sol_is_a,
                        ),
                        fee: w.fee_rate as f64 / FEE_RATE_DENOMINATOR,
                    })
                }),
                Entry::RaydiumClmm { label, fee, .. } => it.next().flatten().and_then(|a| {
                    let p = PoolState::load_checked(&a.data).ok()?;
                    let sol_is_a = p.token_mint_0 == sol_mint();
                    Some(PoolPrice {
                        label: label.clone(),
                        lamports_per_token: lamports_per_token(
                            sqrt_price_x64_to_price(p.sqrt_price_x64),
                            sol_is_a,
                        ),
                        fee: *fee,
                    })
                }),
                Entry::Dlmm { label, .. } => it.next().flatten().and_then(|a| {
                    let d = DlmmInfo::load_checked(&a.data).ok()?;
                    let bin_step = d.lb_pair.bin_step;
                    let base_fee = d.lb_pair.parameters.base_factor as f64 * bin_step as f64 * 10.0
                        / DLMM_FEE_PRECISION;
                    let sol_is_a = d.token_x_mint == sol_mint();
                    Some(PoolPrice {
                        label: label.clone(),
                        lamports_per_token: lamports_per_token(
                            dlmm_price(d.active_id, bin_step),
                            sol_is_a,
                        ),
                        fee: base_fee,
                    })
                }),
            };
            if let Some(p) = price {
                prices.push(p);
            }
        }

        Ok(Snapshot {
            prices,
            wsol_balance,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn price(p: f64, fee: f64) -> PoolPrice {
        PoolPrice {
            label: String::new(),
            lamports_per_token: p,
            fee,
        }
    }

    #[test]
    fn spread_finds_cheapest_buy_and_richest_sell() {
        let prices = [price(100.0, 0.0), price(103.0, 0.0), price(101.0, 0.0)];
        let s = best_spread(&prices).unwrap();
        assert_eq!((s.buy, s.sell), (0, 1));
        assert!((s.bps - 300.0).abs() < 1e-9);
    }

    #[test]
    fn spread_is_negative_when_fees_eat_the_gap() {
        // 0.4% gap, 0.25% fee on each leg: (1.004 * 0.9975^2 - 1) ~= -0.1%
        let s = best_spread(&[price(100.0, 0.0025), price(100.4, 0.0025)]).unwrap();
        assert!(s.bps < 0.0 && s.bps > -15.0, "bps = {}", s.bps);
    }

    #[test]
    fn spread_ignores_invalid_prices_and_needs_two_pools() {
        assert!(best_spread(&[price(100.0, 0.0)]).is_none());
        assert!(best_spread(&[price(100.0, 0.0), price(f64::NAN, 0.0)]).is_none());
        assert!(best_spread(&[price(0.0, 0.0), price(100.0, 0.0)]).is_none());
    }

    #[test]
    fn sqrt_price_round_trips() {
        // sqrt(4) = 2 in Q64.64
        assert!((sqrt_price_x64_to_price(2u128 << 64) - 4.0).abs() < 1e-12);
        assert!((sqrt_price_x64_to_price(1u128 << 63) - 0.25).abs() < 1e-12);
    }

    #[test]
    fn orientation_inverts_when_sol_is_token_a() {
        assert_eq!(lamports_per_token(4.0, false), 4.0);
        assert_eq!(lamports_per_token(4.0, true), 0.25);
    }

    #[test]
    fn dlmm_price_follows_bin_step() {
        assert_eq!(dlmm_price(0, 25), 1.0);
        assert!((dlmm_price(1, 25) - 1.0025).abs() < 1e-12);
        assert!((dlmm_price(-2, 100) - 1.0 / 1.01f64.powi(2)).abs() < 1e-12);
    }

    #[test]
    fn reads_token_account_amount() {
        let mut data = vec![0u8; 165];
        data[64..72].copy_from_slice(&1_234_567u64.to_le_bytes());
        assert_eq!(token_account_amount(&data), Some(1_234_567));
        assert_eq!(token_account_amount(&data[..70]), None);
    }

    #[test]
    fn reads_amm_config_fees() {
        let mut cp = vec![0u8; 64];
        cp[12..20].copy_from_slice(&2_500u64.to_le_bytes());
        assert!((raydium_cp_fee(&cp).unwrap() - 0.0025).abs() < 1e-12);

        let mut clmm = vec![0u8; 64];
        clmm[47..51].copy_from_slice(&500u32.to_le_bytes());
        assert!((raydium_clmm_fee(&clmm).unwrap() - 0.0005).abs() < 1e-12);
    }
}

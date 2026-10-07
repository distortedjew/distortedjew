use crate::config::{Config, MintConfig};
use crate::jito::{compute_tip, random_tip_account, JitoClient};
use crate::kamino::KAMINO_ADDITIONAL_COMPUTE_UNITS;
use crate::pools::MintPoolData;
use crate::quote::{best_spread, token_account_amount, Quoter};
use crate::refresh::initialize_pool_data;
use crate::transaction::{
    build_transaction, estimate_network_fee, send_via_rpc, simulate, TxParams,
};
use anyhow::Context;
use solana_client::nonblocking::rpc_client::RpcClient as NonblockingRpcClient;
use solana_client::rpc_client::RpcClient;
use solana_sdk::address_lookup_table::state::AddressLookupTable;
use solana_sdk::address_lookup_table::AddressLookupTableAccount;
use solana_sdk::hash::Hash;
use solana_sdk::native_token::lamports_to_sol;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;
use std::str::FromStr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, RwLock};
use tracing::{debug, error, info, warn};

/// Lookup table shipped with upstream; holds common program and DEX accounts.
const DEFAULT_LOOKUP_TABLE: &str = "4sKLJ1Qoudh8PJyqBeuKocYdsZvxTcRShUt9aKqwhgvC";

/// Pool data plus its quoter, swapped as one unit on refresh.
struct MintState {
    pool_data: MintPoolData,
    quoter: Quoter,
}

/// Funnel counters, logged periodically so you can see where attempts drop out.
#[derive(Default)]
struct Stats {
    checked: AtomicU64,
    spread_passed: AtomicU64,
    simulated_ok: AtomicU64,
    profitable: AtomicU64,
    sent: AtomicU64,
    quote_errors: AtomicU64,
}

impl Stats {
    fn bump(counter: &AtomicU64) {
        counter.fetch_add(1, Ordering::Relaxed);
    }

    fn log(&self, dry_run: bool) {
        info!(
            "stats: checked={} spread_passed={} sim_ok={} profitable={} {}={} quote_errors={}",
            self.checked.load(Ordering::Relaxed),
            self.spread_passed.load(Ordering::Relaxed),
            self.simulated_ok.load(Ordering::Relaxed),
            self.profitable.load(Ordering::Relaxed),
            if dry_run { "would_send" } else { "sent" },
            self.sent.load(Ordering::Relaxed),
            self.quote_errors.load(Ordering::Relaxed),
        );
    }
}

/// Everything a mint worker needs, shared across workers.
struct Shared {
    config: Config,
    wallet: Keypair,
    rpc: Arc<NonblockingRpcClient>,
    sending_rpcs: Vec<Arc<NonblockingRpcClient>>,
    jito: Option<JitoClient>,
    blockhash: Mutex<Hash>,
    stats: Stats,
}

pub async fn run_bot(config_path: &str) -> anyhow::Result<()> {
    let config = Config::load(config_path)?;
    info!("Configuration loaded successfully");

    let blocking_rpc = Arc::new(RpcClient::new(config.rpc.url.clone()));
    let rpc = Arc::new(NonblockingRpcClient::new(config.rpc.url.clone()));

    let sending_rpcs = match &config.spam {
        Some(spam) if spam.enabled => spam
            .sending_rpc_urls
            .iter()
            .map(|url| Arc::new(NonblockingRpcClient::new(url.clone())))
            .collect(),
        _ => vec![rpc.clone()],
    };

    let jito = match &config.jito {
        Some(j) if j.enabled => Some(JitoClient::new(j)?),
        _ => None,
    };

    let wallet =
        load_keypair(&config.wallet.private_key).context("Failed to load wallet keypair")?;
    info!("Wallet loaded: {}", wallet.pubkey());

    if config.bot.dry_run {
        warn!("DRY RUN: opportunities are simulated and logged, nothing is sent. Set bot.dry_run = false to trade.");
    } else if jito.is_some() {
        info!("LIVE: sending profitable trades as Jito bundles");
    } else {
        warn!("LIVE without Jito: trades that revert on-chain still pay network fees");
    }

    check_wallet(&blocking_rpc, &wallet.pubkey(), &config);

    let shared = Arc::new(Shared {
        blockhash: Mutex::new(rpc.get_latest_blockhash().await?),
        config: config.clone(),
        wallet,
        rpc: rpc.clone(),
        sending_rpcs,
        jito,
        stats: Stats::default(),
    });

    tokio::spawn(blockhash_refresher(shared.clone(), Duration::from_secs(10)));

    let stats_interval = Duration::from_secs(config.bot.stats_interval_secs.max(1));
    let stats_shared = shared.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(stats_interval).await;
            stats_shared.stats.log(stats_shared.config.bot.dry_run);
        }
    });

    for mint_config in &config.routing.mint_config_list {
        info!("Processing mint: {}", mint_config.mint);

        let pool_data = load_pool_data(&blocking_rpc, mint_config, &shared.wallet.pubkey()).await?;
        let quoter = Quoter::new(&rpc, &pool_data).await?;
        if quoter.pool_count() < 2 {
            warn!(
                "Mint {} has {} pool(s); arbitrage needs at least two",
                mint_config.mint,
                quoter.pool_count()
            );
        }
        let state = Arc::new(RwLock::new(Arc::new(MintState { pool_data, quoter })));

        let lookup_tables = load_lookup_tables(&blocking_rpc, mint_config);

        tokio::spawn(pool_refresher(
            shared.clone(),
            blocking_rpc.clone(),
            mint_config.clone(),
            state.clone(),
        ));
        tokio::spawn(mint_worker(
            shared.clone(),
            mint_config.clone(),
            state,
            lookup_tables,
        ));
    }

    loop {
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

async fn load_pool_data(
    rpc: &Arc<RpcClient>,
    mint_config: &MintConfig,
    wallet: &Pubkey,
) -> anyhow::Result<MintPoolData> {
    // initialize_pool_data makes blocking RPC calls; keep them off the async workers.
    let rpc = rpc.clone();
    let mint_config = mint_config.clone();
    let wallet = wallet.to_string();
    tokio::task::spawn_blocking(move || {
        futures::executor::block_on(initialize_pool_data(
            &mint_config.mint,
            &wallet,
            mint_config.raydium_pool_list.as_ref(),
            mint_config.raydium_cp_pool_list.as_ref(),
            mint_config.pump_pool_list.as_ref(),
            mint_config.meteora_dlmm_pool_list.as_ref(),
            mint_config.whirlpool_pool_list.as_ref(),
            mint_config.raydium_clmm_pool_list.as_ref(),
            rpc,
        ))
    })
    .await?
}

/// Tick and bin arrays are derived from the price at load time; as the price
/// moves they go stale and swaps start failing. Re-derive them periodically.
async fn pool_refresher(
    shared: Arc<Shared>,
    blocking_rpc: Arc<RpcClient>,
    mint_config: MintConfig,
    state: Arc<RwLock<Arc<MintState>>>,
) {
    let interval = Duration::from_secs(shared.config.bot.pool_refresh_secs.max(1));
    loop {
        tokio::time::sleep(interval).await;
        let refreshed = async {
            let pool_data =
                load_pool_data(&blocking_rpc, &mint_config, &shared.wallet.pubkey()).await?;
            let quoter = Quoter::new(&shared.rpc, &pool_data).await?;
            anyhow::Ok(MintState { pool_data, quoter })
        }
        .await;
        match refreshed {
            Ok(new_state) => {
                *state.write().await = Arc::new(new_state);
                debug!("Refreshed pool data for mint {}", mint_config.mint);
            }
            Err(e) => warn!(
                "Pool refresh failed for mint {}, keeping previous data: {:#}",
                mint_config.mint, e
            ),
        }
    }
}

async fn mint_worker(
    shared: Arc<Shared>,
    mint_config: MintConfig,
    state: Arc<RwLock<Arc<MintState>>>,
    lookup_tables: Vec<AddressLookupTableAccount>,
) {
    let delay = Duration::from_millis(mint_config.process_delay);
    loop {
        // Clone the Arc and drop the lock before any network I/O.
        let current = state.read().await.clone();
        if let Err(e) = try_arbitrage(&shared, &current, &lookup_tables).await {
            Stats::bump(&shared.stats.quote_errors);
            warn!("Mint {}: {:#}", mint_config.mint, e);
        }
        tokio::time::sleep(delay).await;
    }
}

/// One attempt: quote, simulate, decide, send. Returns Err only for RPC or
/// build failures; "no opportunity" is Ok.
async fn try_arbitrage(
    shared: &Shared,
    state: &MintState,
    lookup_tables: &[AddressLookupTableAccount],
) -> anyhow::Result<()> {
    let config = &shared.config;
    let stats = &shared.stats;
    Stats::bump(&stats.checked);

    // 1. Cheap pre-filter on marginal prices.
    let snapshot = state.quoter.snapshot(&shared.rpc).await?;
    let Some(spread) = best_spread(&snapshot.prices) else {
        return Ok(());
    };
    if spread.bps < config.bot.min_spread_bps {
        return Ok(());
    }
    Stats::bump(&stats.spread_passed);
    let route = format!(
        "buy {} -> sell {} ({:.1} bps)",
        snapshot.prices[spread.buy].label, snapshot.prices[spread.sell].label, spread.bps
    );

    // 2. Simulate with no profit floor and no tip to measure gross profit.
    let blockhash = *shared.blockhash.lock().await;
    let kamino = config
        .kamino_flashloan
        .as_ref()
        .map_or(false, |k| k.enabled);
    let max_cu = config.bot.compute_unit_limit
        + if kamino {
            KAMINO_ADDITIONAL_COMPUTE_UNITS
        } else {
            0
        };
    let cu_price = config.spam.as_ref().map_or(1000, |s| s.compute_unit_price);
    let wsol = state.pool_data.wallet_wsol_account;

    let probe = build_transaction(
        &shared.wallet,
        config,
        &state.pool_data,
        blockhash,
        lookup_tables,
        TxParams {
            compute_unit_limit: max_cu,
            compute_unit_price: cu_price,
            minimum_profit: 0,
            tip: None,
        },
    )?;
    let sim = match simulate(&shared.rpc, &probe, &wsol).await? {
        Ok(sim) => sim,
        Err(reason) => {
            debug!("{}: probe simulation failed: {}", route, reason);
            return Ok(());
        }
    };
    Stats::bump(&stats.simulated_ok);

    let gross = sim.wsol_after as i128 - snapshot.wsol_balance as i128;
    if gross <= 0 {
        debug!("{}: simulated gross profit {} lamports", route, gross);
        return Ok(());
    }
    let gross = gross as u64;

    // 3. Size compute, tip and fee from the simulation, then check net profit.
    let cu_limit = sim
        .units_consumed
        .map(|used| (used * 115 / 100 + 1_000) as u32)
        .unwrap_or(max_cu)
        .min(max_cu);
    let tip = config
        .jito
        .as_ref()
        .filter(|j| j.enabled)
        .map(|j| compute_tip(gross, j))
        .unwrap_or(0);
    let network_fee = estimate_network_fee(cu_limit, cu_price);
    let net = gross as i128 - network_fee as i128 - tip as i128;
    if net < config.bot.min_profit_lamports as i128 {
        info!(
            "{}: gross {} - fee {} - tip {} = net {} lamports, below min_profit_lamports {}",
            route, gross, network_fee, tip, net, config.bot.min_profit_lamports
        );
        return Ok(());
    }
    Stats::bump(&stats.profitable);

    // 4. Build the real transaction with an on-chain profit floor so it
    //    reverts if the price moves before it lands, and re-simulate it.
    let final_tx = build_transaction(
        &shared.wallet,
        config,
        &state.pool_data,
        blockhash,
        lookup_tables,
        TxParams {
            compute_unit_limit: cu_limit,
            compute_unit_price: cu_price,
            minimum_profit: config.bot.min_profit_lamports + network_fee + tip,
            tip: shared.jito.as_ref().map(|_| (random_tip_account(), tip)),
        },
    )?;
    if let Err(reason) = simulate(&shared.rpc, &final_tx, &wsol).await? {
        warn!(
            "{}: probe was profitable but final simulation failed (price moved, or the executor's minimum_profit check differs): {}",
            route, reason
        );
        return Ok(());
    }

    let summary = format!(
        "{}: gross {} SOL, fee {} SOL, tip {} SOL, net {} SOL",
        route,
        lamports_to_sol(gross),
        lamports_to_sol(network_fee),
        lamports_to_sol(tip),
        lamports_to_sol(net as u64)
    );

    if config.bot.dry_run {
        Stats::bump(&stats.sent);
        info!("[dry-run] would send {}", summary);
        return Ok(());
    }

    // 5. Send.
    if let Some(jito) = &shared.jito {
        for result in jito.send_bundle(&final_tx).await {
            match result {
                Ok(bundle_id) => info!("Bundle {} sent: {}", bundle_id, summary),
                Err(e) => error!("Bundle send failed: {:#}", e),
            }
        }
    } else {
        let retries = config
            .spam
            .as_ref()
            .and_then(|s| s.max_retries)
            .unwrap_or(3) as usize;
        for sig in send_via_rpc(&shared.sending_rpcs, &final_tx, retries).await {
            info!("Transaction {} sent: {}", sig, summary);
        }
    }
    Stats::bump(&stats.sent);
    Ok(())
}

fn load_lookup_tables(rpc: &RpcClient, mint_config: &MintConfig) -> Vec<AddressLookupTableAccount> {
    let mut addresses = mint_config
        .lookup_table_accounts
        .clone()
        .unwrap_or_default();
    addresses.push(DEFAULT_LOOKUP_TABLE.to_string());

    let mut tables = vec![];
    for address in addresses {
        let loaded = Pubkey::from_str(&address)
            .map_err(anyhow::Error::from)
            .and_then(|pubkey| {
                let account = rpc.get_account(&pubkey)?;
                let table = AddressLookupTable::deserialize(&account.data)
                    .map_err(|e| anyhow::anyhow!("{}", e))?;
                Ok(AddressLookupTableAccount {
                    key: pubkey,
                    addresses: table.addresses.into_owned(),
                })
            });
        match loaded {
            Ok(table) => {
                info!("   Loaded lookup table: {}", table.key);
                tables.push(table);
            }
            Err(e) => error!("   Skipping lookup table {}: {:#}", address, e),
        }
    }
    if tables.is_empty() {
        warn!("   Warning: No valid lookup tables were loaded");
    }
    tables
}

/// Warns about wallet setup that would make every simulation fail.
fn check_wallet(rpc: &RpcClient, wallet: &Pubkey, config: &Config) {
    match rpc.get_balance(wallet) {
        Ok(lamports) => {
            info!("Wallet SOL balance: {}", lamports_to_sol(lamports));
            if lamports < 10_000_000 {
                warn!("Wallet has under 0.01 SOL; fees and tips may fail");
            }
        }
        Err(e) => warn!("Could not read wallet balance: {}", e),
    }

    let kamino = config
        .kamino_flashloan
        .as_ref()
        .map_or(false, |k| k.enabled);
    let wsol = spl_associated_token_account::get_associated_token_address(
        wallet,
        &crate::constants::sol_mint(),
    );
    match rpc.get_account(&wsol) {
        Ok(account) => {
            let amount = token_account_amount(&account.data).unwrap_or(0);
            info!("Wallet WSOL balance: {}", lamports_to_sol(amount));
            if amount == 0 && !kamino {
                warn!("WSOL balance is 0 and Kamino flash loans are off; run `spl-token wrap <amount>` to fund trades");
            }
        }
        Err(_) => warn!(
            "No WSOL account {} for this wallet; create it with `spl-token wrap <amount>` (or `spl-token create-account {}`)",
            wsol,
            crate::constants::SOL_MINT
        ),
    }

    for mint_config in &config.routing.mint_config_list {
        let Ok(mint) = Pubkey::from_str(&mint_config.mint) else {
            continue;
        };
        let ata = spl_associated_token_account::get_associated_token_address(wallet, &mint);
        if rpc.get_account(&ata).is_err() {
            warn!(
                "No token account for mint {}; create it with `spl-token create-account {}`",
                mint, mint
            );
        }
    }
}

async fn blockhash_refresher(shared: Arc<Shared>, refresh_interval: Duration) {
    loop {
        tokio::time::sleep(refresh_interval).await;
        match shared.rpc.get_latest_blockhash().await {
            Ok(blockhash) => {
                *shared.blockhash.lock().await = blockhash;
                debug!("Blockhash refreshed: {}", blockhash);
            }
            Err(e) => error!("Failed to refresh blockhash: {:?}", e),
        }
    }
}

fn load_keypair(private_key: &str) -> anyhow::Result<Keypair> {
    if let Ok(keypair) = bs58::decode(private_key)
        .into_vec()
        .map_err(|e| anyhow::anyhow!("Failed to decode base58: {}", e))
        .and_then(|bytes| {
            Keypair::from_bytes(&bytes).map_err(|e| anyhow::anyhow!("Invalid keypair bytes: {}", e))
        })
    {
        return Ok(keypair);
    }

    if let Ok(keypair) = solana_sdk::signature::read_keypair_file(private_key) {
        return Ok(keypair);
    }

    // Never echo the value: it may be a mistyped private key.
    anyhow::bail!("wallet.private_key is neither a base58 secret key nor a readable keypair file")
}

use serde::{Deserialize, Deserializer};
use std::{env, fs::File, io::Read};

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    pub bot: BotConfig,
    pub routing: RoutingConfig,
    pub rpc: RpcConfig,
    pub spam: Option<SpamConfig>,
    pub wallet: WalletConfig,
    pub kamino_flashloan: Option<KaminoFlashloanConfig>,
    pub jito: Option<JitoConfig>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct BotConfig {
    pub compute_unit_limit: u32,
    /// Simulate and log opportunities but never send. Defaults to true so a
    /// fresh config cannot spend money until it is switched off on purpose.
    #[serde(default = "default_true")]
    pub dry_run: bool,
    /// Net profit (after network fee and Jito tip) a trade must clear, in lamports.
    #[serde(default = "default_min_profit_lamports")]
    pub min_profit_lamports: u64,
    /// Fee-adjusted price gap between two pools, in basis points, required
    /// before a candidate is simulated. Lower it to simulate more near-misses.
    #[serde(default)]
    pub min_spread_bps: f64,
    /// How often to re-derive tick/bin arrays from the pools' current price.
    #[serde(default = "default_pool_refresh_secs")]
    pub pool_refresh_secs: u64,
    /// How often to log the funnel counters (checked / simulated / sent).
    #[serde(default = "default_stats_interval_secs")]
    pub stats_interval_secs: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RoutingConfig {
    pub mint_config_list: Vec<MintConfig>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct MintConfig {
    pub mint: String,
    pub raydium_pool_list: Option<Vec<String>>,
    pub meteora_dlmm_pool_list: Option<Vec<String>>,
    pub raydium_cp_pool_list: Option<Vec<String>>,
    pub pump_pool_list: Option<Vec<String>>,
    pub whirlpool_pool_list: Option<Vec<String>>,
    pub raydium_clmm_pool_list: Option<Vec<String>>,
    pub lookup_table_accounts: Option<Vec<String>>,
    pub process_delay: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RpcConfig {
    #[serde(deserialize_with = "serde_string_or_env")]
    pub url: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SpamConfig {
    pub enabled: bool,
    pub sending_rpc_urls: Vec<String>,
    pub compute_unit_price: u64,
    pub max_retries: Option<u64>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct WalletConfig {
    #[serde(deserialize_with = "serde_string_or_env")]
    pub private_key: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct KaminoFlashloanConfig {
    pub enabled: bool,
    /// Amount borrowed per trade, in lamports. Upstream hard-coded 10,000 SOL.
    pub amount_lamports: Option<u64>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct JitoConfig {
    pub enabled: bool,
    #[serde(default = "default_block_engine_urls")]
    pub block_engine_urls: Vec<String>,
    /// Share of the simulated gross profit paid as the Jito tip.
    #[serde(default = "default_tip_percent")]
    pub tip_percent: u64,
    #[serde(default = "default_min_tip_lamports")]
    pub min_tip_lamports: u64,
    #[serde(default = "default_max_tip_lamports")]
    pub max_tip_lamports: u64,
}

fn default_true() -> bool {
    true
}

fn default_min_profit_lamports() -> u64 {
    50_000
}

fn default_pool_refresh_secs() -> u64 {
    30
}

fn default_stats_interval_secs() -> u64 {
    60
}

fn default_block_engine_urls() -> Vec<String> {
    vec!["https://mainnet.block-engine.jito.wtf".to_string()]
}

fn default_tip_percent() -> u64 {
    50
}

fn default_min_tip_lamports() -> u64 {
    10_000
}

fn default_max_tip_lamports() -> u64 {
    10_000_000
}

pub fn serde_string_or_env<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    let value_or_env = String::deserialize(deserializer)?;
    let value = match value_or_env.chars().next() {
        Some('$') => env::var(&value_or_env[1..])
            .unwrap_or_else(|_| panic!("reading `{}` from env", &value_or_env[1..])),
        _ => value_or_env,
    };
    Ok(value)
}

impl Config {
    pub fn load(path: &str) -> anyhow::Result<Self> {
        let mut file = File::open(path)?;
        let mut contents = String::new();
        file.read_to_string(&mut contents)?;

        let config: Config = toml::from_str(&contents)?;
        Ok(config)
    }

    pub fn jito_enabled(&self) -> bool {
        self.jito.as_ref().map_or(false, |j| j.enabled)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn example_config_parses_with_safe_defaults() {
        std::env::set_var("SOLANA_RPC_URL", "http://localhost:8899");
        std::env::set_var("SOLANA_PRIVATE_KEY", "unused");
        let config =
            Config::load(concat!(env!("CARGO_MANIFEST_DIR"), "/config.toml.example")).unwrap();
        assert!(config.bot.dry_run);
        assert!(config.jito_enabled());
        assert_eq!(config.rpc.url, "http://localhost:8899");
        assert!(!config.kamino_flashloan.unwrap().enabled);
    }

    #[test]
    fn minimal_config_defaults_to_dry_run() {
        let config: Config = toml::from_str(
            r#"
            [bot]
            compute_unit_limit = 1
            [routing]
            mint_config_list = []
            [rpc]
            url = "http://x"
            [wallet]
            private_key = "k"
            "#,
        )
        .unwrap();
        assert!(config.bot.dry_run);
        assert_eq!(config.bot.min_profit_lamports, 50_000);
        assert!(!config.jito_enabled());
    }
}

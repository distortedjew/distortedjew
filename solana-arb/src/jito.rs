//! Sends transactions as single-transaction Jito bundles.
//!
//! A bundle whose transaction fails is dropped by the block engine instead of
//! landing, so failed arbitrage attempts cost nothing. The tip transfer sits
//! inside the arbitrage transaction itself, so it is only paid when the trade
//! succeeds.

use crate::config::JitoConfig;
use base64::Engine;
use rand::seq::SliceRandom;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::transaction::VersionedTransaction;
use std::str::FromStr;
use std::time::Duration;

/// Jito's published mainnet tip accounts. Spreading tips across them reduces
/// write-lock contention.
pub const TIP_ACCOUNTS: [&str; 8] = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

pub fn random_tip_account() -> Pubkey {
    let account = TIP_ACCOUNTS
        .choose(&mut rand::thread_rng())
        .expect("tip account list is non-empty");
    Pubkey::from_str(account).expect("tip accounts are valid pubkeys")
}

/// Tip as a share of simulated gross profit, clamped to the configured range.
pub fn compute_tip(gross_profit_lamports: u64, config: &JitoConfig) -> u64 {
    let share = (gross_profit_lamports as u128 * config.tip_percent as u128 / 100) as u64;
    share
        .max(config.min_tip_lamports)
        .min(config.max_tip_lamports.max(config.min_tip_lamports))
}

pub struct JitoClient {
    http: reqwest::Client,
    bundle_urls: Vec<String>,
}

impl JitoClient {
    pub fn new(config: &JitoConfig) -> anyhow::Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()?;
        let bundle_urls = config
            .block_engine_urls
            .iter()
            .map(|u| format!("{}/api/v1/bundles", u.trim_end_matches('/')))
            .collect();
        Ok(Self { http, bundle_urls })
    }

    /// Submits the transaction to every configured block engine and returns
    /// one result (bundle id or error) per engine.
    pub async fn send_bundle(&self, tx: &VersionedTransaction) -> Vec<anyhow::Result<String>> {
        let encoded = match bincode::serialize(tx) {
            Ok(bytes) => base64::engine::general_purpose::STANDARD.encode(bytes),
            Err(e) => return vec![Err(e.into())],
        };
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "sendBundle",
            "params": [[encoded], {"encoding": "base64"}],
        });

        let sends = self.bundle_urls.iter().map(|url| self.post(url, &body));
        futures::future::join_all(sends).await
    }

    async fn post(&self, url: &str, body: &serde_json::Value) -> anyhow::Result<String> {
        let response: serde_json::Value =
            self.http.post(url).json(body).send().await?.json().await?;
        if let Some(err) = response.get("error") {
            anyhow::bail!("{}: {}", url, err);
        }
        response
            .get("result")
            .and_then(|r| r.as_str())
            .map(str::to_string)
            .ok_or_else(|| anyhow::anyhow!("{}: unexpected response {}", url, response))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(tip_percent: u64, min: u64, max: u64) -> JitoConfig {
        JitoConfig {
            enabled: true,
            block_engine_urls: vec![],
            tip_percent,
            min_tip_lamports: min,
            max_tip_lamports: max,
        }
    }

    #[test]
    fn tip_is_share_of_profit_within_bounds() {
        assert_eq!(
            compute_tip(1_000_000, &cfg(50, 10_000, 10_000_000)),
            500_000
        );
        assert_eq!(compute_tip(1_000, &cfg(50, 10_000, 10_000_000)), 10_000);
        assert_eq!(
            compute_tip(1_000_000_000, &cfg(50, 10_000, 10_000_000)),
            10_000_000
        );
    }

    #[test]
    fn tip_min_wins_over_misconfigured_max() {
        assert_eq!(compute_tip(0, &cfg(50, 20_000, 5_000)), 20_000);
    }

    #[test]
    fn tip_accounts_parse() {
        for a in TIP_ACCOUNTS {
            Pubkey::from_str(a).unwrap();
        }
        assert!(TIP_ACCOUNTS.contains(&random_tip_account().to_string().as_str()));
    }
}

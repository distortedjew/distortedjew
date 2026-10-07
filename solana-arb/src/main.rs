use solana_arbitrage_bot::bot;

use clap::{App, Arg};
use tracing::{info, Level};
use tracing_subscriber::{EnvFilter, FmtSubscriber};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // RUST_LOG overrides the default level, e.g. RUST_LOG=debug to see every
    // rejected candidate.
    let subscriber = FmtSubscriber::builder()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(Level::INFO.as_str())),
        )
        .finish();
    tracing::subscriber::set_global_default(subscriber)
        .expect("Failed to set global default subscriber");

    info!("Starting Solana Onchain Bot");

    let matches = App::new("Solana Onchain Arbitrage Bot")
        .version("0.1.0")
        .author("Cetipo")
        .about("A simplified Solana onchain arbitrage bot")
        .arg(
            Arg::with_name("config")
                .short('c')
                .long("config")
                .value_name("FILE")
                .help("Sets a custom config file")
                .takes_value(true)
                .default_value("config.toml"),
        )
        .get_matches();

    let config_path = matches.value_of("config").unwrap();
    info!("Using config file: {}", config_path);

    bot::run_bot(config_path).await?;

    Ok(())
}

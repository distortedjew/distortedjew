# solana-arb

Two-pool SOL arbitrage bot for Raydium (AMM v4, CP, CLMM), Pump AMM, Meteora
DLMM and Orca Whirlpool. Forked from `solana-arbitrage-bot2.0` in
[ChangeYourself0613/Solana-Arbitrage-Bot](https://github.com/ChangeYourself0613/Solana-Arbitrage-Bot)
(MIT, see `LICENSE-upstream`).

## What changed from upstream

Upstream sent a transaction for every token every 400 ms with
`minimum_profit = 0`, without checking prices, and paid fees on every revert.
This fork only sends when a trade is shown to be profitable:

1. **Pre-filter** (`src/quote.rs`): one `getMultipleAccounts` call per attempt
   reads every pool's marginal price and fee. If no pair of pools beats both
   fees, the attempt stops there.
2. **Probe simulation**: the arbitrage transaction is simulated with no profit
   floor and no tip. The wallet's WSOL balance change is the gross profit.
3. **Net profit check**: gross minus network fee minus Jito tip must clear
   `min_profit_lamports`.
4. **Final simulation**: the real transaction (tip included, on-chain
   `minimum_profit` set so it reverts if the price moves) must also succeed.
5. **Send** as a Jito bundle, so a trade that would fail is dropped instead of
   costing fees. Plain RPC sending is still available.

Also: pool tick/bin arrays are re-derived every `pool_refresh_secs` (upstream
computed them once at startup), compute units are sized from the simulation,
the Kamino flash-loan amount is configurable (upstream hard-coded 10,000 SOL),
`dry_run` defaults to on, and a funnel counter is logged every
`stats_interval_secs`.

## What you are trusting

Swaps execute through the closed-source program
`MEViEnscUm6tsQRoGd9h6nLQaQspKj7DB2M5FwM3Xvz` (from solanamevbot.com), which
receives a writable fee account `6AGB9kqgSp2mQXwYpdrV4QVV8urvCaDS35U1wsLssy6H`.
Its source and fee are not public. The simulations measure your WSOL balance
after everything that program does, so its fee is already counted in the
profit figures, but you are still signing transactions for code you cannot
read. Use a dedicated wallet.

## Setup

```bash
# 1. A dedicated wallet, funded with only what you can lose
solana-keygen new -o ~/arb-wallet.json
solana config set --keypair ~/arb-wallet.json --url https://api.mainnet-beta.solana.com
# send it some SOL, then wrap part of it as trading capital:
spl-token wrap 0.5
# 2. One token account per mint you trade
spl-token create-account <MINT>

# 3. Config
cp config.toml.example config.toml        # edit pools, keep dry_run = true
export SOLANA_RPC_URL="https://<your paid RPC>"
export SOLANA_PRIVATE_KEY="$HOME/arb-wallet.json"   # path or base58 key

# 4. Run
cargo run --release -- --config config.toml
RUST_LOG=debug cargo run --release -- --config config.toml   # see every rejected candidate
```

## Reading a dry run

Every `stats_interval_secs` the bot logs:

```
stats: checked=600 spread_passed=12 sim_ok=3 profitable=1 would_send=1 quote_errors=0
```

- `spread_passed` near 0: these pools are efficiently priced. Try other tokens
  or newer and thinner pools.
- `sim_ok` much lower than `spread_passed`: run with `RUST_LOG=debug` to see
  why simulations fail (missing token account, no WSOL, stale tick arrays).
- `profitable` > 0 but `would_send` = 0: the final simulation failed. Look for
  the warning line. The price may have moved, or the executor's
  `minimum_profit` check may measure profit differently.
- `[dry-run] would send ...` lines show the gross, fee, tip and net each trade
  would have made.

Only set `dry_run = false` once dry runs show `would_send` trades with a net
profit you're happy with. Even then, live results will be worse: other bots
see the same opportunities and some land first.

## Tests

```bash
cargo test
```

Covers the price and spread maths, fee parsing, tip sizing, network-fee
estimation and config defaults. Nothing here has been run against mainnet in
CI. The first dry run on your machine is the integration test.

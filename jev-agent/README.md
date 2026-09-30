# jev-agent

A small always-on decision agent for stocks and crypto, built on **Jev** (TypeSafe AI's fast decision model: a typed choice/score in ~70-500 ms instead of generated text). **Paper trading only.**

```
feed (ticks) -> state -> Jev "higher or lower in HORIZON_SEC?" -> confidence gate -> RISK LAYER -> broker -> logs/decisions.jsonl
```

- `src/model.ts`  Jev via `experimental_evaluate` (AI SDK 7), plus a `MockModel` so it runs with no key.
- `src/risk.ts`   Hard limits outside the model: per-symbol and total exposure caps, order rate limit, daily-loss kill switch (flattens and halts), spot only (no shorting).
- `src/broker.ts` Paper broker: crosses the spread, adds slippage and taker fees.
- `src/alpaca.ts`  Alpaca adapter: stock + crypto websocket feed and a **paper-only** broker (URL hard-coded to paper-api.alpaca.markets).
- `src/dashboard.ts` + `public/index.html`  Read-only live dashboard (equity curve, prices, Jev buy/sell probabilities, positions, activity, risk limits). No control endpoints.
- `src/feeds.ts`  Binance public websocket (crypto, no key) and a simulated feed for tests.

## Run

```bash
cp .env.example .env
npm install
npm test
npm start                       # MODEL=mock FEED=sim: no key, no network needed
# real data, mock model:        FEED=binance npm start
# real data, real Jev:          MODEL=jev TYPESAFE_AI_API_KEY=... FEED=binance npm start
```

## Install on a VPS from GitHub

Needs Node.js 22+ (Ubuntu: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs git`).

```bash
git clone -b claude/jev-trading-agent https://github.com/distortedjew/distortedjew.git
cd distortedjew/jev-agent
sudo bash deploy/install.sh          # copies to /opt/jev-agent, creates a systemd service
sudo nano /opt/jev-agent/.env        # paste TYPESAFE_AI_API_KEY, Alpaca keys, MODEL=jev
sudo systemctl restart jev-agent
journalctl -u jev-agent -f           # live logs
```

The service restarts automatically on crash or reboot. Update later with `git pull && sudo bash deploy/install.sh && sudo systemctl restart jev-agent` (your `.env` is kept).

## Honest limits

- "Very fast" here means a decision every ~0.5 s per symbol, bounded by API latency. This is not co-located HFT; you won't out-race market makers on latency. Slow decisions are discarded (`MAX_LATENCY_MS`).
- Fees and spread eat short-horizon edge. Run on paper for weeks and read `logs/decisions.jsonl` before trusting any result. Confidence from Jev is calibrated in aggregate, not a guarantee.
- The simulated feed only tests plumbing. The default `MockModel` is not a strategy.
- Stocks are **not implemented yet**: the `Feed`/`Broker` interfaces are ready for an Alpaca adapter (free paper API, market hours only). Live crypto orders are also not implemented; going live is a separate step behind these same risk limits.

## Alpaca (stocks + crypto, paper)

1. Sign up free at alpaca.markets, switch to **Paper Trading**, generate API keys (only you can do this; it needs your identity).
2. In `.env`: `FEED=alpaca BROKER=alpaca ALPACA_KEY_ID=... ALPACA_SECRET_KEY=... SYMBOLS=AAPL,TSLA,BTC/USD`
3. `npm start`. Stocks use the free IEX feed and only trade in market hours (the broker refuses stock orders when the market is closed). Crypto runs 24/7.

Status: written against Alpaca's documented API but **not yet run against a real account** (no keys in the build sandbox). First run with `MAX_POSITION_USD=50` and watch the dashboard.

## Dashboard

Served by the agent at `http://127.0.0.1:8787` (live via server-sent events), bound to localhost. From your laptop: `ssh -L 8787:127.0.0.1:8787 user@your-vps`, then open `localhost:8787`. To expose it, use a TLS reverse proxy and set `DASHBOARD_TOKEN`, then open `/?token=...`.

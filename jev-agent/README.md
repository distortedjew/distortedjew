# jev-agent

A small always-on decision agent for stocks and crypto, built on **Jev** (TypeSafe AI's fast decision model: a typed choice/score in ~70-500 ms instead of generated text). **Paper trading only.**

**Default strategy (`STRATEGY=trend`): daily crypto trend following, backtested.** The research, design and results are in [STRATEGY.md](STRATEGY.md). In short: from 2018 to 2026, after 0.30% costs per trade, it returned **21.7% a year with Sharpe 1.49 and a maximum drawdown of -16%**. Holding BTC returned 22.9% with Sharpe 0.65 and a -81% drawdown.

| Layer | What | When |
|---|---|---|
| Trend ensemble | 9 Donchian breakout models per coin (5-360 days) with trailing stops; volatility-targeted, correlation-aware sizing | daily, after the UTC close |
| AI risk officer | LLM via OpenRouter (default `stealth/space-bunny-alpha`); may only **cut** a coin (x0..1) for a concrete risk | every `AI_REVIEW_EVERY_HOURS` (6) |
| Jev executor | works each order over `EXEC_WINDOW_MIN` in slices, waiting while Jev expects a better price; the deadline always completes it | during rebalances |
| Risk layer | exposure caps, order rate, daily-loss kill switch, $10 minimum, no shorting | every order |
| Shadow portfolio | the same strategy without AI cuts, to measure whether the AI helps | continuously |

```bash
npm run fetch-data   # download daily history (Binance) into data/
npm run backtest     # rerun the evidence on your own data
```

The earlier intraday mode (Jev every 0.5 s plus an LLM plan) is `STRATEGY=scalp`. It's experimental, because fees make short-horizon trading very hard (see STRATEGY.md). With `FEED=alpaca` for stocks, the bot runs Jev alone.

- `src/strategy/trend.ts`  The trend strategy (pure functions shared by the backtest and the live bot).
- `src/trend-trader.ts` + `src/executor.ts` + `src/overlay.ts`  The daily runner, the Jev-timed executor, and the AI risk officer.
- `src/backtest.ts` + `src/fetch-data.ts`  The backtester and the history download.
- `src/daily-bars.ts`  Live completed daily bars (Binance, with an Alpaca fallback).
- `src/notify.ts`  Optional Telegram alerts for rebalances, AI cuts, the kill switch and failures.
- `src/market-data.ts`  The market picture for the LLM: multi-timeframe candles, order book, funding and open interest, and news.
- `src/strategist.ts`  Scalp mode only: the LLM plan-setter.
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
git clone https://github.com/distortedjew/distortedjew.git
cd distortedjew/jev-agent
sudo bash deploy/install.sh          # copies to /opt/jev-agent, creates a systemd service
sudo nano /opt/jev-agent/.env        # paste TYPESAFE_AI_API_KEY, Alpaca keys, MODEL=jev
sudo systemctl restart jev-agent
journalctl -u jev-agent -f           # live logs
```

The service restarts automatically on crash or reboot. Update later with `git pull && sudo bash deploy/install.sh && sudo systemctl restart jev-agent` (your `.env` is kept).

## Honest limits

- The free Space Bunny model is a stealth preview: OpenRouter's free tier allows ~50 requests/day without credits (hence the 30 min default), prompts may be logged by the provider, and the model can be withdrawn. Set `STRATEGIST_FALLBACK_MODELS` so the bot keeps a plan if it disappears; when no plan is available it opens nothing new, and open positions keep their stop-loss / take-profit.

- "Very fast" here means a decision every ~0.5 s per symbol, bounded by API latency. This is not co-located HFT; you won't out-race market makers on latency. Slow decisions are discarded (`MAX_LATENCY_MS`).
- Fees and spread eat short-horizon edge. Run on paper for weeks and read `logs/decisions.jsonl` before trusting any result. Confidence from Jev is calibrated in aggregate, not a guarantee.
- The simulated feed only tests plumbing. The default `MockModel` is not a strategy.
- Stocks are **not implemented yet**: the `Feed`/`Broker` interfaces are ready for an Alpaca adapter (free paper API, market hours only). Live crypto orders are also not implemented; going live is a separate step behind these same risk limits.

## Alpaca (stocks + crypto, paper)

1. Sign up free at alpaca.markets, switch to **Paper Trading**, generate API keys (only you can do this; it needs your identity).
2. In `.env`, set `ALPACA_KEY_ID` / `ALPACA_SECRET_KEY`, then pick one:
   - **Crypto (recommended):** `FEED=binance BROKER=alpaca SYMBOLS=BTCUSDT,ETHUSDT`. Binance's free feed ticks many times a second; orders go to your Alpaca paper account as BTC/USD, ETH/USD. On a US server set `BINANCE_WS_URL=wss://stream.binance.us:9443`.
   - **Stocks:** `FEED=alpaca BROKER=alpaca SYMBOLS=AAPL,TSLA`. Alpaca's free feed allows one websocket and is thin (ETH/USD there was ~5 quotes/min in testing), too slow for crypto at a 30 s horizon.
3. `npm start`. Stocks use the free IEX feed and only trade in market hours (the broker refuses stock orders when the market is closed). Crypto runs 24/7.

Orders under $10 are refused by Alpaca, so the risk layer never places a buy under `MIN_ORDER_USD` and turns a small exit into a full close. A rejected order counts as an error and shows on the dashboard.

## Dashboard

Served by the agent at `http://127.0.0.1:8787` (live via server-sent events), bound to localhost. From your laptop: `ssh -L 8787:127.0.0.1:8787 user@your-vps`, then open `localhost:8787`. To expose it, use a TLS reverse proxy and set `DASHBOARD_TOKEN`, then open `/?token=...`.

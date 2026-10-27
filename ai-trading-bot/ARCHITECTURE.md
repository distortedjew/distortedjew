# AI Trading Bot — architecture

```
┌──────────────────────┐   SQLite (WAL)    ┌──────────────────────┐  REST + WebSocket  ┌──────────────────────┐
│ Python trading engine│ ───────────────▶  │ FastAPI gateway      │ ─────────────────▶ │ React dashboard      │
│ tradebot.engine_main │  state, outbox,   │ tradebot.api.main    │  /api/*   /ws      │ dashboard/ (Vite)    │
│ (the only writer of  │  live snapshots   │ (reads, pushes,      │                    │ (read-only view +    │
│  trading state)      │ ◀───────────────  │  validates settings) │ ◀───────────────── │  settings forms)     │
└──────────────────────┘  settings (poll)  └──────────────────────┘   settings PUT     └──────────────────────┘
```

Two Python processes and a static web app. The engine and the API never call
each other: the SQLite database (`TRADEBOT_DB`, WAL mode) is the boundary.

- **Engine** — market data, indicators, regime, multi-timeframe analysis, the AI
  analyst, risk manager and paper broker. It is the only process that changes
  trading state. It appends every noteworthy happening to the `events` outbox
  and refreshes `live_state` snapshots (ticker, positions, portfolio, risk,
  status heartbeat) about once a second.
- **API** — read-mostly gateway. REST endpoints read the database; one
  broadcaster task tails `events` by id and watches `live_state` versions,
  pushing WebSocket frames to every dashboard. It writes only settings,
  notification read-flags, backtest jobs, and `SETTINGS_CHANGED` events.
- **Dashboard** — React + TypeScript + Vite + Tailwind. It renders what the
  API serves and edits settings. **It has no way to place, close or modify a
  trade**: there are no control endpoints. Settings are validated by Pydantic
  with hard bounds and applied by the engine on its own schedule.

Why a database boundary instead of one process: the engine keeps trading if
the API restarts or a backtest pins a CPU, the API can report the engine as
OFFLINE from a stale heartbeat, and a browser refresh or an engine restart
loses nothing because every piece of state is persisted.

## Layout

```
ai-trading-bot/
  ARCHITECTURE.md          this file
  README.md                setup, running, configuration
  .env.example             every environment variable, documented
  scripts/                 dev.sh (engine + API + Vite), start.sh (production)
  backend/
    pyproject.toml
    tradebot/
      schemas.py           THE contract: every model crossing a process boundary
      db.py                SQLite schema + shared helpers (settings, live_state, events, notifications)
      config.py            environment config (secrets live only here)
      analytics/metrics.py pure performance statistics (live analytics + backtests)
      engine_main.py       `python -m tradebot.engine_main` / `tradebot-engine`
      market/              feeds (Binance, simulator), candle aggregation, history
      indicators.py        EMA, RSI, MACD, Bollinger, VWAP, ATR, ADX, volume ratio
      regime.py            market-regime classifier
      mtf.py               multi-timeframe report
      ai/                  analysts: OpenRouter (LLM) and local heuristic; prompts; pricing
      strategy/            baseline (technical), hybrid and AI strategies
      risk.py              risk manager (checks, sizing, halts)
      broker.py            paper broker (fees, slippage, SL/TP, limit orders)
      core.py              trading core: clock-driven, shared by live, bootstrap and backtests
      engine.py            live driver: feeds → core, persistence, heartbeat, settings reload
      store.py             engine-side persistence (writes)
      notify/              Telegram / Discord / email delivery (optional)
      backtest/            backtester built on the trading core
      api/                 FastAPI app, routes, WebSocket hub, readers, auth, static files
      analytics/performance.py, analytics/ai_metrics.py   report builders for the API
      system.py            CPU / RAM / uptime / DB stats
    scripts/export_schema.py   JSON Schema of schemas.py → dashboard TypeScript types
    tests/
  dashboard/
    src/types/api.ts       GENERATED from schemas.py (npm run gen:types) — never edit by hand
```

## Conventions (all layers)

- Percent fields (`*_pct`, `confidence`, `win_rate`, `*_accuracy`, `utilization_pct`,
  `progress`) are **percent units**: `4.82` = 4.82 %. Ratios (`profit_factor`,
  `sharpe`, `sortino`, `risk_reward`, `recovery_factor`, `r_multiple`) are plain numbers.
- Money is USDT (quote currency). Prices are floats; formatting is the dashboard's job.
- `datetime` fields are UTC ISO 8601 with `Z`. Chart `time` fields are **unix seconds**.
- Symbols use the slash form `BTC/USDT` everywhere except inside exchange adapters.
- Trade results: `analytics.metrics.classify(pnl)` is the single WIN/LOSS/BREAKEVEN rule.
- IDs: `pos_…`/`dec_…`/`bt_…` + 12 hex chars. A closed `Trade` keeps its position id.
- Secrets come only from environment variables (`config.py`). They are never
  stored in the database, never in `BotSettings`, never in an API response or a
  log line. The API exposes `configured: true/false` and a fixed mask.

## Database

Tables and their writers are defined in `backend/tradebot/db.py` (DDL with comments).

| Table | Writer | Notes |
|---|---|---|
| `settings` | API (engine seeds defaults) | one row; `version` bumps on save; engine applies and reports `status.settings_version` |
| `live_state` | engine | keys: `status`, `portfolio`, `positions`, `risk`, `ticker:{sym}`, `mtf:{sym}`, `regime:{sym}`; `version` bumps per write |
| `events` | engine (+ API for `SETTINGS_CHANGED`) | outbox; monotonic id; clients resume by id |
| `candles` | engine | all six timeframes; the latest row per (symbol, timeframe) is the forming candle, upserted ~1/s |
| `ai_decisions` | engine | `AIAnalysis` payload, rewritten as risk decision / trade id / evaluation change |
| `positions` / `trades` | engine | open positions; closed round trips (moved atomically on close) |
| `equity_snapshots` | engine | every 60 s and on each trade close |
| `notifications` | engine (API flips `read`) | notification center |
| `ai_usage` | engine | one row per LLM request, success or failure |
| `regime_history` | engine | regime segments per symbol |
| `backtests` | API | job rows; results computed in a worker thread with `tradebot.backtest` |

Retention (engine housekeeping, hourly): `MARKET_UPDATE` events 7 days; 1m candles
14 days, 5m 60 days, 15m 180 days, 1h and up kept.

## Engine behaviour

### Market data
- `FEED=auto` (default) tries Binance (REST backfill + combined WebSocket streams of
  klines for all six timeframes and 24h tickers) and falls back to the simulator if
  Binance is unreachable, raising `SYSTEM_WARNING` + `MARKET_DATA_UNAVAILABLE`.
  `FEED=binance` retries with backoff instead of falling back. The active feed is
  always visible (`EngineStatus.feed`, `MarketSnapshot.feed`).
- **Simulator** (`FEED=simulated`): deterministic (`SIM_SEED`) regime-switching
  random walk with volatility clustering, intraday volume seasonality, occasional
  jumps, and cross-asset correlation (ETH/SOL move with BTC plus their own noise).
  Plausible starting prices (BTC ≈ 97,000, ETH ≈ 3,450, SOL ≈ 165; unknown symbols
  get a hashed price). History is generated so every chart is full on first open:
  ≥ 365 daily candles, ≥ 500 of every other timeframe, and every higher timeframe is
  an exact aggregation of the lower ones where both exist. Live ticks arrive once per
  second per symbol and build the forming candles naturally.
- **Bootstrap** (simulator only, empty database): replays the last
  `SIM_BOOTSTRAP_DAYS` (default 14) days of simulated 1m history through the **same
  trading core** on a virtual clock — heuristic analyst only, never the LLM — so a
  fresh install shows a real track record produced by the bot's own logic. It writes
  decisions, trades, equity snapshots and events with historical timestamps (no
  `MARKET_UPDATE` events; notifications created as already read), then announces
  itself with a `SYSTEM_INFO` event and continues live. It must finish in under a minute.

### Decision cycle
Per symbol, on every **decision-timeframe** candle close (`trading.decision_timeframe`,
default 5m):
1. Update the regime (`regime:{sym}`, `regime_history`) and emit `MARKET_UPDATE`.
2. Build the market context: indicator snapshots for 1m/5m/15m/1h/4h, MTF report,
   regime, recent candles, open position on the symbol, portfolio and risk state.
3. Run the configured strategy:
   - `ai` — the analyst's signal stands.
   - `baseline` — a classic technical rule set (EMA 21/50 trend with MACD and RSI
     filters, ATR stops); no AI call, `provider="heuristic"`, `model="baseline-v1"`.
   - `hybrid` — the analyst's signal is taken only when the baseline agrees on
     direction; disagreement turns it into `HOLD` with the conflict as a risk bullet.
4. Persist an `AIAnalysis` and emit `AI_ANALYSIS`. For LONG/SHORT also emit
   `TRADE_SIGNAL`, run the risk manager, emit `RISK_CHECK`, then `TRADE_EXECUTED`
   (+ `TRADE_OPENED` notification) or `TRADE_REJECTED`.

On every tick: forming candles, mark-to-market, SL/TP checks, throttled `live_state`
writes. On every 1m close: MTF report and shadow evaluation of pending signals.
Every 60 s: equity snapshot. Every ~2 s: heartbeat (`status`) and `risk`, and a
check for a new settings version.

### Analysts
- **OpenRouter** (`OPENROUTER_API_KEY` set): chat completions with
  `response_format: json_object`, `usage: {include: true}`, the configured model,
  temperature, max tokens, timeout and retry count (exponential backoff on
  429/5xx/timeouts/unparseable JSON), then `ai.fallback_models` in order. The reply
  is validated (levels on the correct side of entry, confidence 0–100); risk/reward
  is recomputed from the levels, never trusted. Every request is an `ai_usage` row;
  cost comes from OpenRouter's `usage.cost`, else a pricing table estimate.
  Failure → `API_ERROR` event, `AI_UNAVAILABLE` notification (at most one per 30 min
  while failing; a `SYSTEM_INFO` on recovery) and, if `ai.heuristic_fallback`, the
  heuristic answers with `fallback_reason` set.
- **Heuristic** (`heuristic-v1`, used when OpenRouter is not configured or fails):
  a transparent multi-factor model — EMA alignment and slope, MACD histogram and its
  slope, RSI zone, volume expansion, Bollinger position, ADX trend strength and MTF
  alignment — mapped to a signal with a calibrated confidence, ATR-based stop
  (1.5 × ATR, beyond the nearest swing), take-profit at a regime-dependent R multiple,
  human-readable reasons, risks and an invalidation level. Same output schema.

### Risk manager
Every check is evaluated and recorded (`RiskDecision.checks`) so the UI can show
exactly why a signal passed or failed: direction allowed (shorts toggle), trading not
halted, confidence ≥ `min_ai_confidence`, valid levels (stop 0.1–10 % away),
risk/reward ≥ `min_risk_reward`, open positions < `max_positions`, no same-direction
position on the symbol, exposure after entry ≤ `max_exposure_pct`, daily loss plus
this trade's risk ≤ `max_daily_loss_usd`, notional ≥ $10.
Sizing: `risk_per_trade_pct` of equity divided by the stop distance, capped by
`max_position_pct` and remaining exposure headroom (the effective risk is recorded).
An opposite-direction signal on an open symbol closes it (`SIGNAL_REVERSAL`) when its
confidence is ≥ `min_ai_confidence + 10`, otherwise it is rejected.
Halts: daily loss limit → close everything (`KILL_SWITCH`) and halt until the next UTC
day (`DAILY_LOSS_LIMIT`); 80 % of the limit → `RISK_WARNING` + `DAILY_LOSS_WARNING`
once a day; `max_consecutive_losses` → pause `loss_streak_cooldown_minutes`;
drawdown ≥ `max_drawdown_pct` → no new entries for 24 h.

### Paper broker
Market orders fill at the price ± `slippage_bps` against us, `fee_bps` on entry and
exit notional. Limit orders (when `order_type=limit`) rest at the analyst's entry and
expire after `limit_order_timeout_minutes`. Stops fill at the stop level (or the
gapped price, whichever is worse) with slippage; targets fill at the target. In bar
replay, a candle that touches both stop and target counts as the stop. Positions also
exit on `max_holding_minutes` (`TIME_EXIT`). Equity = cash + unrealized P&L.

### Restart recovery
On start the engine reloads settings, open positions, realized P&L, the day's
statistics, peak equity, loss streak and pending signal evaluations from the database,
so a restart is invisible to the dashboard apart from the heartbeat gap.

## API

All responses are `schemas.py` models. Optional auth: when `DASHBOARD_TOKEN` is set,
REST requires `Authorization: Bearer <token>` and the WebSocket `?token=<token>`.

| Method & path | Response | Notes |
|---|---|---|
| `GET /api/health` | `{ok: true}` | liveness, no auth |
| `GET /api/status` | `BotStatus` | online < 10 s heartbeat age, degraded < 60 s, else offline |
| `GET /api/portfolio` | `Portfolio` | live state + KPIs (sparklines, previous-period comparison) |
| `GET /api/positions` | `Position[]` | |
| `GET /api/positions/{id}?timeframe=` | `PositionDetail` | candles around the trade, markers |
| `GET /api/trades` | `TradePage` | filters: `symbol, side, result, strategy, exit_reason, min_confidence, max_confidence, start, end, q`; `sort, order, limit, offset` |
| `GET /api/trades/export.csv` | CSV | same filters |
| `GET /api/trades/{id}?timeframe=` | `TradeDetail` | |
| `GET /api/performance?range=` | `PerformanceReport` | `24h, 7d, 30d, 90d, all` |
| `GET /api/risk` | `RiskSnapshot` | |
| `GET /api/ai/latest?symbol=` | `AIAnalysis \| null` | |
| `GET /api/ai/history` | `AIDecisionPage` | filters: `symbol, signal, risk_status, provider, min_confidence`; `limit, offset` |
| `GET /api/ai/analytics?range=` | `AIAnalytics` | |
| `GET /api/ai/models` | `AIModelInfo` | never key material |
| `GET /api/market?symbol=&timeframe=&limit=` | `MarketSnapshot` | candles + overlay series + trade markers + open-position levels |
| `GET /api/market/watchlist` | `Ticker[]` | with 24h sparklines |
| `GET /api/market/mtf?symbol=` | `MTFReport \| null` | |
| `GET /api/market/regime?symbol=` | `RegimeReport` | current regime, per-regime bot performance, history |
| `GET /api/backtests` | `BacktestSummary[]` | |
| `POST /api/backtests` | `BacktestSummary` (202) | body `BacktestRequest`; runs in a worker |
| `GET /api/backtests/{id}` | `BacktestResult` | poll while `queued`/`running` |
| `DELETE /api/backtests/{id}` | 204 | |
| `GET /api/system` | `SystemHealth` | |
| `GET /api/events` | `EventPage` | `limit, before_id, types, severity, symbol` |
| `GET /api/notifications` | `NotificationList` | `limit, unread_only` |
| `POST /api/notifications/read` | `NotificationList` | body `MarkReadRequest` (empty ids = all) |
| `GET /api/settings` | `SettingsResponse` | |
| `PUT /api/settings` | `SettingsResponse` | body `BotSettings`; read-only fields ignored; emits `SETTINGS_CHANGED` |
| `WS /ws` | `WsServerMessage` frames | see below |

In production the API also serves `dashboard/dist` with an SPA fallback, so one
port serves everything.

## WebSocket protocol (`/ws`)

Every frame is JSON `{"type": ..., "data": ...}` (`schemas.WsServerMessage`).

1. On connect the server sends `hello` (`last_event_id`), then a snapshot burst:
   `status`, `portfolio`, `positions`, `risk`, one `ticker` per symbol, `mtf` and
   `regime` per symbol, and the latest `ai_analysis` per symbol.
2. Streaming: `event` for every new outbox row; alongside `AI_ANALYSIS` events an
   `ai_analysis` frame with the full analysis; `trade_closed` with the full `Trade`;
   `notification` for new notifications; `status`, `portfolio`, `positions`, `risk`,
   `ticker`, `mtf`, `regime` whenever their `live_state` version changes, and
   `status` at least every 2 s so a dead engine shows up as `offline` within seconds;
   `settings` after a save; `candle` (forming or closed, with overlay values) for each
   chart the connection subscribed to.
3. Client frames (`schemas.WsClientMessage`): `subscribe_chart` replaces the
   connection's chart subscriptions; `resume` replays events after `last_event_id`
   (sent after every reconnect); `ping` → `pong`.

Clients reconnect with exponential backoff and jitter, resume from the last event id,
and refetch REST snapshots after reconnecting. Slow clients get ticker/candle frames
dropped first and are disconnected if their queue stays full.

## Dashboard

React 19, TypeScript (strict), Vite, Tailwind CSS 4, TanStack Query (REST cache),
Zustand (live WebSocket state), React Router, TradingView Lightweight Charts (price
charts), Recharts (analytics charts), Radix primitives (accessible popovers, dialogs,
tooltips, selects, switches, tabs), Framer Motion (subtle transitions), Lucide icons.

```
dashboard/src/
  types/api.ts          generated contract types (npm run gen:types)
  lib/                  api client, ws manager, formatters, chart theme, utils
  stores/               live store (connection, tickers, events, heartbeat)
  hooks/                query hooks (one per endpoint), live hooks, media queries
  components/ui/        design-system primitives
  components/layout/    app shell, top navigation, mode/status badges, notification center
  components/charts/    candlestick wrapper, themed Recharts building blocks, sparkline
  features/<domain>/    domain components (market, ai, positions, trades, performance, risk,
                        backtests, system, settings, overview)
  pages/                one file per route
```

Routes: `/` Overview, `/markets`, `/positions`, `/trades`, `/ai`, `/performance`,
`/risk`, `/backtests`, `/system`, `/settings`.

Data flow: query hooks fetch REST snapshots; the WebSocket manager writes live frames
into the Zustand store and into the TanStack Query cache (`setQueryData`) so every view
updates without refetching; after a reconnect, queries are invalidated. The connection
state drives the `LIVE ●` indicator and a reconnecting/offline banner. The trading mode
badge (`PAPER TRADING`, or a red `LIVE TRADING` banner) is part of the shell and
visible on every page and every breakpoint.

## Testing

- Backend: `cd backend && .venv/bin/pytest` (unit tests for indicators, regime,
  analysts incl. a mocked OpenRouter, risk, broker, core, metrics, API routes and the
  WebSocket hub against temporary databases).
- Dashboard: `npm run typecheck && npm run lint && npm test && npm run build`.
- End to end: `dashboard/e2e/` (Playwright) launches engine + API + built dashboard
  and checks live prices, AI decisions, trades on the chart, positions/P&L/risk
  updates, persistence across refresh and restart, WebSocket reconnection, error
  states, mobile layout, the paper-trading badge and the absence of secrets.

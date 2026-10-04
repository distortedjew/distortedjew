// systemd's EnvironmentFile keeps inline "# comments" as part of the value, so strip them here.
const env = (k: string, d: string) => (process.env[k] ?? "").replace(/\s+#.*$/, "").trim() || d;
const num = (k: string, d: number) => {
  const v = Number(env(k, String(d)));
  if (!Number.isFinite(v)) throw new Error(`${k} must be a number, got "${process.env[k]}"`);
  return v;
};

const strategy = env("STRATEGY", "trend") as "trend" | "scalp";
const capital = num("CAPITAL_USD", 10000);

export const config = {
  strategy,
  /** trend: the amount of the account the strategy manages; weights are fractions of this. */
  capitalUsd: capital,
  model: env("MODEL", "mock") as "mock" | "jev",
  jevModelId: env("JEV_MODEL_ID", "jev-latest"),
  feed: env("FEED", "sim") as "sim" | "binance" | "alpaca",
  binanceRestUrl: env("BINANCE_REST_URL", "https://api.binance.com"), // US servers: https://api.binance.us
  binanceFuturesUrl: env("BINANCE_FUTURES_URL", "https://fapi.binance.com"), // not reachable from the US; that data is then skipped
  strategist: {
    apiKey: env("OPENROUTER_API_KEY", ""),
    model: env("STRATEGIST_MODEL", "stealth/space-bunny-alpha"),
    fallbackModels: env("STRATEGIST_FALLBACK_MODELS", "").split(",").map((s) => s.trim()).filter(Boolean),
    everyMin: num("STRATEGY_EVERY_MIN", 30),
    timeoutMs: num("STRATEGIST_TIMEOUT_SEC", 120) * 1000,
    minConviction: num("MIN_CONVICTION", 0.6),
  },
  alphaVantageKey: env("ALPHAVANTAGE_API_KEY", ""),
  newsEveryMin: num("NEWS_EVERY_MIN", 60),
  trend: {
    variant: env("TREND_VARIANT", "1d"),
    // Tournament winner's regime filters (see src/arena/TOURNAMENT.md); off = the original strategy.
    filters: env("TREND_FILTERS", "on") === "on",
    filterBtcMaDays: num("FILTER_BTC_MA", 100),
    filterCoinMaDays: num("FILTER_COIN_MA", 50),
    filterMinSignal: num("FILTER_MIN_SIGNAL", 0.4), // 1d | 4h-fast | 4h-same (see STRATEGY.md; switch only after npm run backtest -- --compare)
    targetVol: num("TARGET_VOL", 0.25),
    maxWeight: num("MAX_WEIGHT", 0.35),
    rebalanceUtcHour: num("REBALANCE_UTC_HOUR", 0), // daily bars close at 00:00 UTC; rebalance shortly after
    execWindowMin: num("EXEC_WINDOW_MIN", 60),
    execSlices: num("EXEC_SLICES", 4),
    execCheckSec: num("EXEC_CHECK_SEC", 20),
    jevWaitConfidence: num("JEV_WAIT_CONFIDENCE", 0.65),
    aiReviewEveryHours: num("AI_REVIEW_EVERY_HOURS", 6),
  },
  news: {
    enabled: env("NEWS_REFLEX", "on") === "on",
    feeds: env("NEWS_FEEDS", "https://www.coindesk.com/arc/outboundfeeds/rss/,https://cointelegraph.com/rss,https://decrypt.co/feed,https://www.theblock.co/rss.xml").split(",").map((s) => s.trim()).filter(Boolean),
    pollSec: num("NEWS_POLL_SEC", 60),
    maxAgeMin: num("NEWS_MAX_AGE_MIN", 30),
    severeConfidence: num("NEWS_SEVERE_CONFIDENCE", 0.7),
    cutTo: num("NEWS_CUT_TO", 0),
    cutHours: num("NEWS_CUT_HOURS", 12),
  },
  scorecard: { enabled: env("SCORECARD", "on") === "on", everySec: num("SCORECARD_EVERY_SEC", 15) },
  telegram: { token: env("TELEGRAM_BOT_TOKEN", ""), chatId: env("TELEGRAM_CHAT_ID", "") },
  exitConfidence: num("EXIT_CONFIDENCE", 0.75),
  minHoldSec: num("MIN_HOLD_SEC", 120),
  reentryCooldownMin: num("REENTRY_COOLDOWN_MIN", 15),
  binanceWsUrl: env("BINANCE_WS_URL", "wss://stream.binance.com:9443"), // US servers: wss://stream.binance.us:9443
  broker: env("BROKER", "paper") as "paper" | "alpaca",
  alpaca: { keyId: env("ALPACA_KEY_ID", ""), secret: env("ALPACA_SECRET_KEY", "") },
  dashboard: { port: num("DASHBOARD_PORT", 8787), host: env("DASHBOARD_HOST", "127.0.0.1"), token: env("DASHBOARD_TOKEN", "") },
  symbols: env("SYMBOLS", "BTCUSDT,ETHUSDT,SOLUSDT,DOGEUSDT,AVAXUSDT,LINKUSDT").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
  startCash: num("START_CASH", strategy === "trend" ? capital : 10000),
  horizonSec: num("HORIZON_SEC", 120),
  decideEveryMs: num("DECIDE_EVERY_MS", 500),
  minConfidence: num("MIN_CONFIDENCE", 0.62),
  maxLatencyMs: num("MAX_LATENCY_MS", 1500),
  risk: {
    maxPositionUsd: num("MAX_POSITION_USD", strategy === "trend" ? capital * 0.4 : 1000),
    maxTotalExposureUsd: num("MAX_TOTAL_EXPOSURE_USD", strategy === "trend" ? capital : 3000),
    maxOrdersPerMin: num("MAX_ORDERS_PER_MIN", 20),
    dailyLossLimitUsd: num("DAILY_LOSS_LIMIT_USD", strategy === "trend" ? capital * 0.1 : 200),
    minOrderUsd: num("MIN_ORDER_USD", 10), // Alpaca rejects orders under $10 notional
  },
  feeBps: num("FEE_BPS", 25), // Alpaca crypto taker fee at the base tier
  slippageBps: num("SLIPPAGE_BPS", 1),
};
export type Config = typeof config;

// systemd's EnvironmentFile keeps inline "# comments" as part of the value, so strip them here.
const env = (k: string, d: string) => (process.env[k] ?? "").replace(/\s+#.*$/, "").trim() || d;
const num = (k: string, d: number) => {
  const v = Number(env(k, String(d)));
  if (!Number.isFinite(v)) throw new Error(`${k} must be a number, got "${process.env[k]}"`);
  return v;
};

export const config = {
  model: env("MODEL", "mock") as "mock" | "jev",
  jevModelId: env("JEV_MODEL_ID", "jev-latest"),
  feed: env("FEED", "sim") as "sim" | "binance" | "alpaca",
  binanceWsUrl: env("BINANCE_WS_URL", "wss://stream.binance.com:9443"), // US servers: wss://stream.binance.us:9443
  broker: env("BROKER", "paper") as "paper" | "alpaca",
  alpaca: { keyId: env("ALPACA_KEY_ID", ""), secret: env("ALPACA_SECRET_KEY", "") },
  dashboard: { port: num("DASHBOARD_PORT", 8787), host: env("DASHBOARD_HOST", "127.0.0.1"), token: env("DASHBOARD_TOKEN", "") },
  symbols: env("SYMBOLS", "BTCUSDT,ETHUSDT").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
  startCash: num("START_CASH", 10000),
  horizonSec: num("HORIZON_SEC", 30),
  decideEveryMs: num("DECIDE_EVERY_MS", 500),
  minConfidence: num("MIN_CONFIDENCE", 0.62),
  maxLatencyMs: num("MAX_LATENCY_MS", 1500),
  risk: {
    maxPositionUsd: num("MAX_POSITION_USD", 1000),
    maxTotalExposureUsd: num("MAX_TOTAL_EXPOSURE_USD", 3000),
    maxOrdersPerMin: num("MAX_ORDERS_PER_MIN", 20),
    dailyLossLimitUsd: num("DAILY_LOSS_LIMIT_USD", 200),
    minOrderUsd: num("MIN_ORDER_USD", 10), // Alpaca rejects orders under $10 notional
  },
  feeBps: num("FEE_BPS", 10),
  slippageBps: num("SLIPPAGE_BPS", 1),
};
export type Config = typeof config;

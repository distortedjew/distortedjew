const env = (k: string, d: string) => process.env[k] ?? d;
const num = (k: string, d: number) => Number(env(k, String(d)));

export const config = {
  model: env("MODEL", "mock") as "mock" | "jev",
  jevModelId: env("JEV_MODEL_ID", "jev-latest"),
  feed: env("FEED", "sim") as "sim" | "binance" | "alpaca",
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
  },
  feeBps: num("FEE_BPS", 10),
  slippageBps: num("SLIPPAGE_BPS", 1),
};
export type Config = typeof config;

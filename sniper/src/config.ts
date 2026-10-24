export interface Config {
  pollIntervalMs: number;
  maxPairAgeSec: number;
  minLiquidityUsd: number;
  minVolume5mUsd: number;
  minBuySellRatio: number;
  maxTop10HolderPct: number;
  minLpLockedPct: number;
  positionSizeUsd: number;
  maxOpenPositions: number;
  startingBalanceUsd: number;
  /** Simulated adverse slippage per fill, in basis points. */
  slippageBps: number;
  /** Simulated fixed network + priority fee per fill, in USD. */
  feeUsd: number;
  stopLossPct: number;
  trailingStopPct: number;
  /** Take-profit ladder: sell `fraction` of the original position at `multiple` x entry. */
  takeProfits: { multiple: number; fraction: number }[];
  maxHoldSec: number;
  dailyLossLimitUsd: number;
}

export const defaultConfig: Config = {
  pollIntervalMs: 15_000,
  maxPairAgeSec: 30 * 60,
  minLiquidityUsd: 15_000,
  minVolume5mUsd: 5_000,
  minBuySellRatio: 1.2,
  maxTop10HolderPct: 35,
  minLpLockedPct: 80,
  positionSizeUsd: 25,
  maxOpenPositions: 5,
  startingBalanceUsd: 500,
  slippageBps: 300,
  feeUsd: 0.1,
  stopLossPct: 25,
  trailingStopPct: 20,
  takeProfits: [
    { multiple: 2, fraction: 0.5 },
    { multiple: 4, fraction: 0.3 },
  ],
  maxHoldSec: 60 * 60,
  dailyLossLimitUsd: 75,
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cfg = { ...defaultConfig };
  const num = (k: string, set: (n: number) => void) => {
    const v = env[k];
    if (v === undefined || v === "") return;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`Invalid number for ${k}: ${v}`);
    set(n);
  };
  num("POLL_INTERVAL_MS", (n) => (cfg.pollIntervalMs = n));
  num("MIN_LIQUIDITY_USD", (n) => (cfg.minLiquidityUsd = n));
  num("POSITION_SIZE_USD", (n) => (cfg.positionSizeUsd = n));
  num("MAX_OPEN_POSITIONS", (n) => (cfg.maxOpenPositions = n));
  num("STARTING_BALANCE_USD", (n) => (cfg.startingBalanceUsd = n));
  num("SLIPPAGE_BPS", (n) => (cfg.slippageBps = n));
  num("STOP_LOSS_PCT", (n) => (cfg.stopLossPct = n));
  num("DAILY_LOSS_LIMIT_USD", (n) => (cfg.dailyLossLimitUsd = n));
  return cfg;
}

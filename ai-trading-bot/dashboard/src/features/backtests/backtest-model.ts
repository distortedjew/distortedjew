/**
 * Pure backtest logic: request defaults and validation (mirroring BacktestRequest's bounds and the
 * API's extra checks), trade → chart-marker conversion, comparison "best per row", trade stats.
 */
import { TIMEFRAME_SECONDS } from "@/lib/constants";
import { formatPct } from "@/lib/format";
import type {
  BacktestMetrics,
  BacktestRequest,
  BacktestRun,
  BacktestTrade,
  Candle,
  ChartMarker,
  ChartMarkerKind,
  StrategyName,
} from "@/types";

export const HEURISTIC_MODEL = "heuristic-v1";
/** API limits (api/routes/backtests.py). */
export const MAX_SPAN_DAYS = 3 * 365;
export const MAX_BARS = 250_000;
/** LLM backtests consult the model at most this many times (backtest/runner.py). */
export const MAX_LLM_CALLS = 300;

/** Fixed series order for the comparison (colors follow the strategy, never its rank). */
export const STRATEGY_ORDER: StrategyName[] = ["ai", "hybrid", "baseline"];
export function strategySlot(strategy: StrategyName): number {
  return STRATEGY_ORDER.indexOf(strategy);
}

// ---------------------------------------------------------------- dates

/** "YYYY-MM-DD" for a Date in UTC (the API compares dates against its UTC today). */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

// ---------------------------------------------------------------- request

export function defaultRequest(today: string, overrides: Partial<BacktestRequest> = {}): BacktestRequest {
  return {
    symbol: "BTC/USDT",
    timeframe: "1h",
    start: addDays(today, -90),
    end: today,
    strategy: "hybrid",
    ai_model: HEURISTIC_MODEL,
    starting_balance: 10_000,
    risk_pct: 1,
    fee_bps: 5,
    slippage_bps: 2,
    min_ai_confidence: 65,
    min_risk_reward: 1.5,
    compare: true,
    ...overrides,
  };
}

const SYMBOL_RE = /^[A-Z0-9]{2,12}\/[A-Z0-9]{2,8}$/;

const NUMERIC: { key: keyof BacktestRequest; min: number; max?: number; exclusiveMin?: boolean }[] = [
  { key: "starting_balance", min: 0, exclusiveMin: true },
  { key: "risk_pct", min: 0.1, max: 5 },
  { key: "fee_bps", min: 0, max: 100 },
  { key: "slippage_bps", min: 0, max: 100 },
  { key: "min_ai_confidence", min: 0, max: 100 },
  { key: "min_risk_reward", min: 0.5, max: 10 },
];

/** Number of candles of the chosen timeframe in the window. */
export function barCount(request: Pick<BacktestRequest, "start" | "end" | "timeframe">): number {
  const days = daysBetween(request.start, request.end);
  return Math.max(0, Math.floor((days * 86_400) / TIMEFRAME_SECONDS[request.timeframe]));
}

/** Client-side checks, keyed by request field (same keys as the API's 422 `loc`). */
export function validateRequest(
  request: BacktestRequest,
  today: string,
): Partial<Record<keyof BacktestRequest, string>> {
  const errors: Partial<Record<keyof BacktestRequest, string>> = {};
  if (!SYMBOL_RE.test(request.symbol.trim().toUpperCase())) {
    errors.symbol = "Symbol must look like BASE/QUOTE, e.g. BTC/USDT";
  }
  const validDates = /^\d{4}-\d{2}-\d{2}$/.test(request.start) && /^\d{4}-\d{2}-\d{2}$/.test(request.end);
  if (!validDates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(request.start)) errors.start = "Pick a start date";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(request.end)) errors.end = "Pick an end date";
  } else {
    if (request.end <= request.start) errors.end = "End must be after the start";
    else if (request.end > today) errors.end = "End cannot be in the future";
    if (!errors.end && daysBetween(request.start, request.end) > MAX_SPAN_DAYS) {
      errors.start = `The period is limited to ${MAX_SPAN_DAYS} days`;
    }
    const bars = barCount(request);
    if (!errors.end && !errors.start && bars > MAX_BARS) {
      errors.timeframe = `${bars.toLocaleString("en-US")} candles is too many (max ${MAX_BARS.toLocaleString("en-US")}) — choose a higher timeframe or a shorter period`;
    }
  }
  for (const { key, min, max, exclusiveMin } of NUMERIC) {
    const value = request[key];
    if (typeof value !== "number" || !Number.isFinite(value)) errors[key] = "Enter a number";
    else if (exclusiveMin ? value <= min : value < min)
      errors[key] = exclusiveMin ? `Must be above ${min}` : `Must be at least ${min}`;
    else if (max !== undefined && value > max) errors[key] = `Must be at most ${max}`;
  }
  return errors;
}

/** "ai_model" etc. from a FastAPI 422 key such as "body.end" or "end". */
export function requestErrorKey(path: string): keyof BacktestRequest | null {
  const key = path.split(".").filter((p) => p !== "body")[0];
  return key ? (key as keyof BacktestRequest) : null;
}

// ---------------------------------------------------------------- markers

/** Open time of the candle containing `time` (candles sorted ascending; may be downsampled). */
export function snapToCandle(time: number, candles: readonly Candle[]): number {
  if (candles.length === 0) return time;
  if (time <= candles[0].time) return candles[0].time;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candles[mid].time <= time) lo = mid;
    else hi = mid - 1;
  }
  return candles[lo].time;
}

export function exitKind(trade: BacktestTrade): ChartMarkerKind {
  if (trade.exit_reason === "STOP_LOSS") return "stop_loss";
  if (trade.exit_reason === "TAKE_PROFIT") return "take_profit";
  return trade.pnl >= 0 ? "exit_win" : "exit_loss";
}

/**
 * Entry ▲/▼ and exit markers for the price chart, snapped to the candles on screen and sorted by
 * time (Lightweight Charts requires ascending markers).
 */
export function tradeMarkers(trades: readonly BacktestTrade[], candles: readonly Candle[]): ChartMarker[] {
  const markers: ChartMarker[] = [];
  trades.forEach((trade, i) => {
    const id = `bt-${i}`;
    markers.push({
      time: snapToCandle(trade.entry_time, candles),
      kind: trade.side === "LONG" ? "entry_long" : "entry_short",
      price: trade.entry_price,
      label: trade.side === "LONG" ? "Long" : "Short",
      trade_id: id,
    });
    markers.push({
      time: snapToCandle(trade.exit_time, candles),
      kind: exitKind(trade),
      price: trade.exit_price,
      label: formatPct(trade.pnl_pct, { signed: true, decimals: 1 }),
      trade_id: id,
    });
  });
  return markers.sort((a, b) => a.time - b.time);
}

// ---------------------------------------------------------------- comparison

export type Better = "higher" | "lower" | null;

export interface ComparisonRow {
  key: keyof BacktestMetrics;
  label: string;
  better: Better;
  info?: string;
}

export const COMPARISON_ROWS: ComparisonRow[] = [
  { key: "total_return_pct", label: "Total return", better: "higher" },
  { key: "net_profit", label: "Net profit", better: "higher" },
  { key: "win_rate", label: "Win rate", better: "higher" },
  {
    key: "profit_factor",
    label: "Profit factor",
    better: "higher",
    info: "Gross profit ÷ gross loss. Above 1 = profitable.",
  },
  {
    key: "max_drawdown_pct",
    label: "Max drawdown",
    better: "higher",
    info: "Deepest fall from a peak; closer to 0 is better.",
  },
  { key: "sharpe", label: "Sharpe", better: "higher", info: "Return per unit of volatility, annualised." },
  {
    key: "sortino",
    label: "Sortino",
    better: "higher",
    info: "Like Sharpe, counting only downside volatility.",
  },
  {
    key: "cagr_pct",
    label: "CAGR",
    better: "higher",
    info: "Compound annual growth rate implied by the period.",
  },
  { key: "expectancy", label: "Expectancy", better: "higher", info: "Average net P&L per trade." },
  { key: "avg_trade_pct", label: "Avg trade", better: "higher" },
  { key: "trades", label: "Trades", better: null },
  {
    key: "exposure_time_pct",
    label: "Time in market",
    better: null,
    info: "Share of the period with a position open.",
  },
];

/** Index of the single best value, or null (fewer than two values, or a tie for best). */
export function bestIndex(values: readonly (number | null | undefined)[], better: Better): number | null {
  if (!better) return null;
  const present = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => typeof x.v === "number" && Number.isFinite(x.v));
  if (present.length < 2) return null;
  const sorted = [...present].sort((a, b) => (better === "higher" ? b.v - a.v : a.v - b.v));
  if (sorted[0].v === sorted[1].v) return null;
  return sorted[0].i;
}

/** Runs in the fixed comparison order (requested strategy keeps its place by name, not rank). */
export function orderedRuns(runs: readonly BacktestRun[]): BacktestRun[] {
  return [...runs].sort((a, b) => strategySlot(a.strategy) - strategySlot(b.strategy));
}

/** Equity curves of several runs merged on time for one Recharts dataset. */
export function mergeEquityCurves(runs: readonly BacktestRun[]): Record<string, number>[] {
  const byTime = new Map<number, Record<string, number>>();
  for (const run of runs) {
    for (const point of run.equity_curve) {
      const row = byTime.get(point.time) ?? { time: point.time };
      row[run.strategy] = point.equity;
      byTime.set(point.time, row);
    }
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

// ---------------------------------------------------------------- trade stats

export interface TradeStats {
  wins: number;
  losses: number;
  longs: number;
  shorts: number;
  best: number | null;
  worst: number | null;
  avgHoldSec: number | null;
}

export function tradeStats(trades: readonly BacktestTrade[]): TradeStats {
  if (!trades.length)
    return { wins: 0, losses: 0, longs: 0, shorts: 0, best: null, worst: null, avgHoldSec: null };
  let wins = 0;
  let losses = 0;
  let longs = 0;
  let hold = 0;
  let best = -Infinity;
  let worst = Infinity;
  for (const t of trades) {
    if (t.pnl > 0) wins += 1;
    else if (t.pnl < 0) losses += 1;
    if (t.side === "LONG") longs += 1;
    hold += Math.max(0, t.exit_time - t.entry_time);
    best = Math.max(best, t.pnl_pct);
    worst = Math.min(worst, t.pnl_pct);
  }
  return {
    wins,
    losses,
    longs,
    shorts: trades.length - longs,
    best,
    worst,
    avgHoldSec: hold / trades.length,
  };
}

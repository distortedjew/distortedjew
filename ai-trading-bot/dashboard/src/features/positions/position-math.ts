/**
 * Pure derivations for open positions: where price sits between stop and target, how the position
 * size follows from the stop distance, and aggregate numbers for the summary strip.
 */
import type { Position, PriceLevel, Side } from "@/types";

export interface SltpGeometry {
  /** Current price as % of the way from stop (0) to target (100), clamped to 0–100 for drawing. */
  currentPct: number;
  /** Entry as % of the way from stop (0) to target (100). */
  entryPct: number;
  /** True when price is beyond the stop or the target (the engine has not closed yet). */
  beyond: "stop" | "target" | null;
}

/**
 * Position of the entry and current price on a stop → target axis. Works for both sides: for a
 * LONG the stop is below the target, for a SHORT above it, and the same linear map covers both.
 * Returns null when stop and target coincide (nothing to draw).
 */
export function sltpGeometry(
  entry: number,
  stop: number,
  target: number,
  current: number,
): SltpGeometry | null {
  const span = target - stop;
  if (!Number.isFinite(span) || span === 0 || ![entry, current].every(Number.isFinite)) return null;
  const raw = ((current - stop) / span) * 100;
  const entryRaw = ((entry - stop) / span) * 100;
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  return {
    currentPct: clamp(raw),
    entryPct: clamp(entryRaw),
    beyond: raw < 0 ? "stop" : raw > 100 ? "target" : null,
  };
}

/** +1 for LONG, −1 for SHORT. */
export function sideSign(side: Side): 1 | -1 {
  return side === "LONG" ? 1 : -1;
}

export interface RiskBreakdown {
  /** |entry − stop| in quote currency per unit. */
  stopDistance: number;
  /** Stop distance as % of the entry price. */
  stopDistancePct: number;
  targetDistance: number;
  targetDistancePct: number;
  /** Planned reward : risk (target distance ÷ stop distance). */
  rewardRisk: number | null;
  /** Equity at entry implied by risk_amount ÷ risk_pct. */
  equityAtEntry: number | null;
  /** Size that risks exactly `risk_amount` at this stop: risk_amount ÷ stop distance. */
  sizeFromRisk: number | null;
  /** True when the actual size is clearly below sizeFromRisk (a position / exposure cap applied). */
  capped: boolean;
  /** Loss if the stop fills at its level (excludes slippage and exit fee). */
  lossAtStop: number;
  /** Gain if the target fills at its level (excludes the exit fee). */
  gainAtTarget: number;
}

export function riskBreakdown(
  p: Pick<
    Position,
    "side" | "size" | "entry_price" | "stop_loss" | "take_profit" | "risk_amount" | "risk_pct"
  >,
): RiskBreakdown {
  const stopDistance = Math.abs(p.entry_price - p.stop_loss);
  const targetDistance = Math.abs(p.take_profit - p.entry_price);
  const sizeFromRisk = stopDistance > 0 ? p.risk_amount / stopDistance : null;
  return {
    stopDistance,
    stopDistancePct: p.entry_price > 0 ? (stopDistance / p.entry_price) * 100 : 0,
    targetDistance,
    targetDistancePct: p.entry_price > 0 ? (targetDistance / p.entry_price) * 100 : 0,
    rewardRisk: stopDistance > 0 ? targetDistance / stopDistance : null,
    equityAtEntry: p.risk_pct > 0 ? p.risk_amount / (p.risk_pct / 100) : null,
    sizeFromRisk,
    capped: sizeFromRisk !== null && p.size < sizeFromRisk * 0.98,
    lossAtStop: p.size * stopDistance,
    gainAtTarget: p.size * targetDistance,
  };
}

export interface PositionsTotals {
  count: number;
  exposure: number;
  unrealizedPnl: number;
  openRisk: number;
  openRiskPct: number;
  /** Mean AI confidence over positions that have one (percent units), or null. */
  avgConfidence: number | null;
  longs: number;
  shorts: number;
}

export function positionTotals(positions: readonly Position[]): PositionsTotals {
  const confidences = positions.flatMap((p) => (p.ai_confidence === null ? [] : [p.ai_confidence]));
  return {
    count: positions.length,
    exposure: positions.reduce((sum, p) => sum + p.size * p.current_price, 0),
    unrealizedPnl: positions.reduce((sum, p) => sum + p.unrealized_pnl, 0),
    openRisk: positions.reduce((sum, p) => sum + p.risk_amount, 0),
    openRiskPct: positions.reduce((sum, p) => sum + p.risk_pct, 0),
    avgConfidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null,
    longs: positions.filter((p) => p.side === "LONG").length,
    shorts: positions.filter((p) => p.side === "SHORT").length,
  };
}

/** Open duration in seconds, ticking with the shared clock (never negative). */
export function openSeconds(openedAt: string, now: number, fallbackSec: number): number {
  const opened = Date.parse(openedAt);
  return Number.isNaN(opened) ? fallbackSec : Math.max(0, Math.floor((now - opened) / 1_000));
}

/** Entry / stop / target lines for the chart, built from the position itself. */
export function levelsFor(p: Position): PriceLevel[] {
  const base = { position_id: p.id, side: p.side } as const;
  return [
    { ...base, kind: "entry", price: p.entry_price, label: "Entry" },
    { ...base, kind: "stop_loss", price: p.stop_loss, label: "SL" },
    { ...base, kind: "take_profit", price: p.take_profit, label: "TP" },
  ];
}

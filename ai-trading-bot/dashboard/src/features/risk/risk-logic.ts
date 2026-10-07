/**
 * Pure risk-page logic: meter tone mapping, value formatting, overall state, halt countdown.
 * Thresholds mirror the backend (risk.py `meter_status`): warning ≥ 70 %, critical ≥ 90 %,
 * breached ≥ 100 % of the limit.
 */
import { DASH, formatInt, formatNumber, formatPct, formatUsd, isNum } from "@/lib/format";
import { toMs } from "@/lib/time";
import type { RiskMeter, RiskMeterStatus, RiskSnapshot, Tone } from "@/types";

export const WARNING_AT_PCT = 70;
export const CRITICAL_AT_PCT = 90;

/** Fixed display order of the six meters (a meter never jumps because another one changes). */
export const METER_ORDER: RiskMeter["key"][] = [
  "daily_loss",
  "daily_risk",
  "drawdown",
  "exposure",
  "positions",
  "consecutive_losses",
];

const STATUS_RANK: Record<RiskMeterStatus, number> = { ok: 0, warning: 1, critical: 2, breached: 3 };

export function statusFromUtilization(utilizationPct: number): RiskMeterStatus {
  if (!isNum(utilizationPct)) return "ok";
  if (utilizationPct >= 100) return "breached";
  if (utilizationPct >= CRITICAL_AT_PCT) return "critical";
  if (utilizationPct >= WARNING_AT_PCT) return "warning";
  return "ok";
}

/**
 * The status to show: the API's, unless the utilization says it is worse (a stale or lagging
 * status must never make a breached limit look calm).
 */
export function effectiveStatus(meter: Pick<RiskMeter, "status" | "utilization_pct">): RiskMeterStatus {
  const fromValue = statusFromUtilization(meter.utilization_pct);
  return STATUS_RANK[fromValue] > STATUS_RANK[meter.status] ? fromValue : meter.status;
}

/** Semantic tone of a meter status (ok = calm accent, warning = amber, critical/breached = red). */
export function statusTone(status: RiskMeterStatus): Tone {
  return status === "ok" ? "accent" : status === "warning" ? "warning" : "down";
}

const FALLBACK_MESSAGE: Record<Exclude<RiskMeterStatus, "ok">, string> = {
  warning: "APPROACHING LIMIT",
  critical: "NEAR LIMIT",
  breached: "LIMIT REACHED",
};

/** The message under a meter: the engine's text, else a generic one; nothing while everything is fine. */
export function meterMessage(meter: RiskMeter): string | null {
  const status = effectiveStatus(meter);
  if (status === "ok") return null;
  return meter.message?.trim() || FALLBACK_MESSAGE[status];
}

/** Filled share of the bar, 0–100 (utilization above the limit still fills the bar completely). */
export function meterFill(utilizationPct: number): number {
  if (!isNum(utilizationPct)) return 0;
  return Math.max(0, Math.min(100, utilizationPct));
}

/** "$180" / "9.96%" / "5" — one side of the "current / limit" label. */
export function formatMeterAmount(unit: RiskMeter["unit"], value: number): string {
  if (!isNum(value)) return DASH;
  if (unit === "usd") return formatUsd(value, { decimals: Number.isInteger(value) ? 0 : 2 });
  if (unit === "pct") return formatPct(value, { decimals: Number.isInteger(value) ? 0 : 2 });
  return formatInt(value);
}

/** "$180 / $200". */
export function formatMeterValue(meter: Pick<RiskMeter, "unit" | "current" | "limit">): string {
  return `${formatMeterAmount(meter.unit, meter.current)} / ${formatMeterAmount(meter.unit, meter.limit)}`;
}

/** Utilization label: 90 % → "90%", 125 → "125%", sub-1 values keep a decimal. */
export function formatUtilization(utilizationPct: number): string {
  if (!isNum(utilizationPct)) return DASH;
  return formatPct(utilizationPct, { decimals: utilizationPct > 0 && utilizationPct < 10 ? 1 : 0 });
}

/** Meters in display order; unknown keys go last. With `bySeverity`, the most severe first. */
export function orderMeters(meters: readonly RiskMeter[], bySeverity = false): RiskMeter[] {
  const rank = (m: RiskMeter) => {
    const i = METER_ORDER.indexOf(m.key);
    return i === -1 ? METER_ORDER.length : i;
  };
  return [...meters].sort((a, b) => {
    if (bySeverity) {
      const d = STATUS_RANK[effectiveStatus(b)] - STATUS_RANK[effectiveStatus(a)];
      if (d !== 0) return d;
    }
    return rank(a) - rank(b);
  });
}

export function worstStatus(meters: readonly RiskMeter[]): RiskMeterStatus {
  return meters.reduce<RiskMeterStatus>(
    (worst, m) => (STATUS_RANK[effectiveStatus(m)] > STATUS_RANK[worst] ? effectiveStatus(m) : worst),
    "ok",
  );
}

export type RiskState = "halted" | "limit" | "caution" | "ok";

export interface RiskStateInfo {
  state: RiskState;
  /** Meters at their limit (breached). */
  breached: RiskMeter[];
  /** Meters in warning or critical. */
  elevated: RiskMeter[];
}

/**
 * Overall state for the hero: halted (the engine refuses new trades), limit (a meter is at its
 * limit although trading is still allowed), caution (a meter is warning/critical) or ok.
 */
export function deriveRiskState(risk: Pick<RiskSnapshot, "trading_allowed" | "meters">): RiskStateInfo {
  const breached = risk.meters.filter((m) => effectiveStatus(m) === "breached");
  const elevated = risk.meters.filter((m) => {
    const s = effectiveStatus(m);
    return s === "warning" || s === "critical";
  });
  const state: RiskState = !risk.trading_allowed
    ? "halted"
    : breached.length
      ? "limit"
      : elevated.length
        ? "caution"
        : "ok";
  return { state, breached, elevated };
}

/** Seconds until `haltedUntil` (null when there is no end time or it has passed). */
export function secondsUntil(haltedUntil: string | null | undefined, nowMs: number): number | null {
  const until = toMs(haltedUntil);
  if (until === null) return null;
  const sec = Math.ceil((until - nowMs) / 1_000);
  return sec > 0 ? sec : null;
}

/** "3h 12m" / "12m 05s" / "45s" — compact countdown. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

/** Plain-language explanation of each meter (tooltip) — matches the engine's risk manager. */
export const METER_INFO: Record<RiskMeter["key"], string> = {
  daily_loss:
    "Loss since 00:00 UTC (realised plus open positions) against the maximum daily loss. At 80 % the bot raises a warning; at 100 % it closes everything and halts until the next UTC day.",
  daily_risk:
    "Today's loss plus the money at risk on open positions (distance to their stops) against the daily loss budget. A new trade is rejected if it would push this past the limit.",
  drawdown:
    "How far equity is below its peak. At the limit the bot stops opening new positions for 24 hours.",
  exposure:
    "Total notional of open positions as a percentage of equity, against the maximum exposure. New entries are rejected when they would exceed it.",
  positions: "Open positions against the maximum number the bot may hold at once.",
  consecutive_losses:
    "Losing trades in a row. Reaching the limit pauses new entries for the cooldown period; a win resets the count.",
};

const SUMMARY_CORE: RiskMeter["key"][] = ["daily_loss", "drawdown", "exposure", "positions"];

/** The meters to show: the four core ones, plus any other meter that is not ok (most severe first). */
export function summaryMeters(risk: Pick<RiskSnapshot, "meters">): RiskMeter[] {
  const ordered = orderMeters(risk.meters);
  const core = ordered.filter((m) => SUMMARY_CORE.includes(m.key));
  const extra = ordered.filter((m) => !SUMMARY_CORE.includes(m.key) && effectiveStatus(m) !== "ok");
  return [
    ...extra.filter((m) => effectiveStatus(m) === "breached"),
    ...core,
    ...extra.filter((m) => effectiveStatus(m) !== "breached"),
  ];
}

export interface Limit {
  label: string;
  info: string;
  value: string;
}

export function limitRows(
  risk: RiskSnapshot,
  settings?: { loss_streak_cooldown_minutes: number; max_position_pct: number },
): Limit[] {
  const rows: Limit[] = [
    {
      label: "Risk per trade",
      info: "Share of equity risked on each new trade; sets the position size.",
      value: formatPct(risk.risk_per_trade_pct),
    },
    {
      label: "Maximum daily loss",
      info: "Closing everything and halting until the next UTC day when reached.",
      value: formatUsd(risk.max_daily_loss, { decimals: 0 }),
    },
    {
      label: "Maximum drawdown",
      info: "No new entries for 24 hours when equity falls this far below its peak.",
      value: `−${formatPct(risk.max_drawdown_limit_pct)}`,
    },
    {
      label: "Maximum exposure",
      info: "Total open notional as a share of equity.",
      value: formatPct(risk.max_exposure_pct, { decimals: 0 }),
    },
    {
      label: "Maximum positions",
      info: "Open positions allowed at once.",
      value: formatInt(risk.max_positions),
    },
    {
      label: "Maximum consecutive losses",
      info: "Reaching this streak pauses new entries for the cooldown period.",
      value: settings
        ? `${formatInt(risk.max_consecutive_losses)} · ${formatInt(settings.loss_streak_cooldown_minutes)} min cooldown`
        : formatInt(risk.max_consecutive_losses),
    },
    {
      label: "Minimum risk / reward",
      info: "Signals whose reward-to-risk ratio is below this are rejected.",
      value: `≥ ${formatNumber(risk.min_risk_reward, 2)}`,
    },
    {
      label: "Minimum AI confidence",
      info: "Signals below this confidence are rejected.",
      value: `≥ ${formatPct(risk.min_confidence, { decimals: 0 })}`,
    },
  ];
  if (settings) {
    rows.push({
      label: "Maximum position size",
      info: "Per-position notional cap as a share of equity.",
      value: formatPct(settings.max_position_pct, { decimals: 0 }),
    });
  }
  return rows;
}

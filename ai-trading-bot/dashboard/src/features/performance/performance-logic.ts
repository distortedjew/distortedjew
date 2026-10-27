/**
 * Pure derivations for the Performance page: metric display values (with the reason a value is
 * missing), tooltip copy that matches backend/tradebot/analytics/metrics.py, heatmap grouping,
 * histogram labels and table thinning.
 */
import {
  DASH,
  MINUS,
  formatDuration,
  formatInt,
  formatNumber,
  formatPct,
  formatPnl,
  formatRatio,
  formatUsd,
  isNum,
  toneOf,
} from "@/lib/format";
import type {
  DistributionBin,
  EquityPoint,
  MonthlyReturn,
  PerformanceReport,
  Tone,
  TradingStats,
} from "@/types";

/** Mirrors metrics.py: CAGR needs this much history, ratios this many daily returns. */
export const MIN_DAYS_FOR_CAGR = 7;
export const MIN_DAYS_FOR_RATIOS = 5;

export interface MetricDisplay {
  /** Formatted value, "—" when missing. */
  text: string;
  tone: Tone;
  /** Why the value is missing (shown as the tooltip on "—"). */
  reason?: string;
}

export interface MetricItem {
  key: string;
  label: string;
  /** Plain-language explanation incl. how it is computed (ⓘ tooltip). */
  info: string;
  display: MetricDisplay;
  sub?: string;
}

const missing = (reason: string): MetricDisplay => ({ text: DASH, tone: "muted", reason });
const ok = (text: string, tone: Tone = "neutral"): MetricDisplay => ({ text, tone });

/** Days covered by the equity curve (0 when it has fewer than two points). */
export function curveSpanDays(curve: readonly EquityPoint[]): number {
  if (curve.length < 2) return 0;
  return (curve[curve.length - 1].time - curve[0].time) / 86_400;
}

function noTrades(report: PerformanceReport): boolean {
  return report.stats.total_trades === 0;
}

export function performanceMetricItems(report: PerformanceReport): MetricItem[] {
  const m = report.metrics;
  const span = curveSpanDays(report.equity_curve);
  const none = "No closed trades in this range yet.";

  const cagr: MetricDisplay = isNum(m.cagr_pct)
    ? ok(
        formatPct(m.cagr_pct, { signed: true, decimals: Math.abs(m.cagr_pct) >= 1000 ? 0 : 2 }),
        toneOf(m.cagr_pct),
      )
    : missing(
        `CAGR needs at least ${MIN_DAYS_FOR_CAGR} days of equity history; this range covers ${formatNumber(span, 1)} days. Annualising a shorter period would only extrapolate noise.`,
      );
  const sharpe: MetricDisplay = isNum(m.sharpe)
    ? ok(formatRatio(m.sharpe), toneOf(m.sharpe))
    : missing(
        `Needs at least ${MIN_DAYS_FOR_RATIOS} daily returns that are not all identical (this range has too few days or no variation in daily equity).`,
      );
  const sortino: MetricDisplay = isNum(m.sortino)
    ? ok(formatRatio(m.sortino), toneOf(m.sortino))
    : missing(
        `Needs at least ${MIN_DAYS_FOR_RATIOS} daily returns and at least one losing day (no downside to measure otherwise).`,
      );
  const profitFactor: MetricDisplay = isNum(m.profit_factor)
    ? ok(formatRatio(m.profit_factor), m.profit_factor >= 1 ? "up" : "down")
    : missing(
        noTrades(report)
          ? none
          : "No losing trades yet: gross loss is zero, so the ratio is undefined (not infinite).",
      );
  const expectancy: MetricDisplay = isNum(m.expectancy)
    ? ok(formatPnl(m.expectancy), toneOf(m.expectancy))
    : missing(none);
  const recovery: MetricDisplay = isNum(m.recovery_factor)
    ? ok(formatRatio(m.recovery_factor), toneOf(m.recovery_factor))
    : missing("Equity never fell below its peak in this range, so there is no drawdown to recover from.");
  const avgTrade: MetricDisplay = isNum(m.avg_trade)
    ? ok(formatPnl(m.avg_trade), toneOf(m.avg_trade))
    : missing(none);

  return [
    {
      key: "total_return",
      label: "Total return",
      info: "Ending equity ÷ starting equity − 1 for the selected range. Equity includes unrealised P&L on open positions and is net of fees.",
      display: ok(formatPct(m.total_return_pct, { signed: true }), toneOf(m.total_return_pct)),
      sub: `${formatUsd(report.starting_equity, { decimals: 0 })} → ${formatUsd(report.ending_equity, { decimals: 0 })}`,
    },
    {
      key: "cagr",
      label: "CAGR",
      info: `Compound annual growth rate: (end ÷ start)^(365 ÷ days) − 1. Only shown with at least ${MIN_DAYS_FOR_CAGR} days of history, because annualising a few days is noise.`,
      display: cagr,
    },
    {
      key: "sharpe",
      label: "Sharpe ratio",
      info: `Return per unit of volatility: mean ÷ standard deviation of daily equity returns × √365 (crypto trades every day), no risk-free rate. Needs at least ${MIN_DAYS_FOR_RATIOS} daily returns. Above 1 is decent, above 2 is strong.`,
      display: sharpe,
    },
    {
      key: "sortino",
      label: "Sortino ratio",
      info: `Like Sharpe but only downside counts: mean daily return ÷ downside deviation (root mean square of the negative days) × √365. Needs at least ${MIN_DAYS_FOR_RATIOS} daily returns and one losing day.`,
      display: sortino,
    },
    {
      key: "profit_factor",
      label: "Profit factor",
      info: "Gross profit ÷ gross loss of closed trades. Above 1.0 the bot earns more than it loses; 1.5 or more is healthy. Shown as — when there are no losing trades yet.",
      display: profitFactor,
      sub: `${formatUsd(m.gross_profit, { compact: true, decimals: 1 })} won / ${formatUsd(Math.abs(m.gross_loss), { compact: true, decimals: 1 })} lost`,
    },
    {
      key: "expectancy",
      label: "Expectancy",
      info: "Average net P&L per trade after fees: what the bot can expect to make (or lose) on each new trade if the past repeats.",
      display: expectancy,
      sub: isNum(m.expectancy_r)
        ? `${formatNumber(m.expectancy_r, 2, { signed: true })}R per trade`
        : undefined,
    },
    {
      key: "max_drawdown",
      label: "Max drawdown",
      info: "Largest peak-to-trough fall in equity within the range (the starting balance counts as the first peak), as a percentage and in USDT.",
      display: ok(formatPct(m.max_drawdown_pct), m.max_drawdown_pct < -0.005 ? "down" : "neutral"),
      sub: formatUsd(m.max_drawdown_usd),
    },
    {
      key: "recovery_factor",
      label: "Recovery factor",
      info: "Net profit ÷ the maximum drawdown in USDT: how many times the profit covers the worst fall. Above 1 means the range earned back more than its worst drawdown. Shown as — if there was no drawdown.",
      display: recovery,
    },
    {
      key: "avg_trade",
      label: "Average trade",
      info: "Mean net P&L of a closed trade (after fees) in USDT, with the mean return per trade in % of its notional below.",
      display: avgTrade,
      sub: isNum(m.avg_trade_pct) ? formatPct(m.avg_trade_pct, { signed: true }) : undefined,
    },
  ];
}

export function tradingStatItems(report: PerformanceReport): MetricItem[] {
  const s: TradingStats = report.stats;
  const none = "No closed trades in this range yet.";
  const rate = (v: number | null | undefined) =>
    isNum(v) ? `${formatPct(v, { decimals: 0 })} win rate` : undefined;
  const count = (v: number): MetricDisplay => ok(formatInt(v));
  return [
    {
      key: "total_trades",
      label: "Total trades",
      info: "Round trips (entry and exit) closed in the selected range.",
      display: count(s.total_trades),
      sub: isNum(s.trades_per_day) ? `${formatNumber(s.trades_per_day, 1)} per day` : undefined,
    },
    {
      key: "long_trades",
      label: "Long trades",
      info: "Trades that bought first and sold later.",
      display: count(s.long_trades),
      sub: rate(s.long_win_rate),
    },
    {
      key: "short_trades",
      label: "Short trades",
      info: "Trades that sold first and bought back later.",
      display: count(s.short_trades),
      sub: rate(s.short_win_rate),
    },
    {
      key: "winning_trades",
      label: "Winning trades",
      info: "Closed trades with a net profit after fees.",
      display: { text: formatInt(s.winning_trades), tone: s.winning_trades > 0 ? "up" : "neutral" },
    },
    {
      key: "losing_trades",
      label: "Losing trades",
      info: "Closed trades with a net loss after fees. Breakeven trades are counted separately.",
      display: { text: formatInt(s.losing_trades), tone: s.losing_trades > 0 ? "down" : "neutral" },
      sub: s.breakeven_trades > 0 ? `${formatInt(s.breakeven_trades)} breakeven` : undefined,
    },
    {
      key: "avg_holding",
      label: "Avg holding time",
      info: "Mean time between a trade's entry and its exit.",
      display: isNum(s.avg_holding_sec) ? ok(formatDuration(s.avg_holding_sec)) : missing(none),
    },
    {
      key: "win_streak",
      label: "Longest win streak",
      info: "Most winning trades in a row. A breakeven trade ends a streak without starting one.",
      display: { text: formatInt(s.longest_win_streak), tone: s.longest_win_streak > 0 ? "up" : "neutral" },
    },
    {
      key: "loss_streak",
      label: "Longest loss streak",
      info: "Most losing trades in a row. A breakeven trade ends a streak without starting one.",
      display: {
        text: formatInt(s.longest_loss_streak),
        tone: s.longest_loss_streak > 0 ? "down" : "neutral",
      },
      sub: describeStreak(s.current_streak),
    },
  ];
}

/** "Current: 5 losses in a row" (null when there is no streak). */
export function describeStreak(current: number): string | undefined {
  if (!current) return undefined;
  const n = Math.abs(current);
  return `Current: ${n} ${current > 0 ? (n === 1 ? "win" : "wins") : n === 1 ? "loss" : "losses"} in a row`;
}

// ---------------------------------------------------------------- win / loss

const NO_TRADES = "No closed trades in this range yet.";

function item(
  key: string,
  label: string,
  info: string,
  value: number | null | undefined,
  format: (v: number) => string,
  tone: "up" | "down",
  sub?: string,
): MetricItem {
  return {
    key,
    label,
    info,
    sub,
    display: isNum(value) ? { text: format(value), tone } : { text: "—", tone: "muted", reason: NO_TRADES },
  };
}

export function winLossItems(report: PerformanceReport): MetricItem[] {
  const w = report.win_loss;
  return [
    item(
      "win_rate",
      "Win rate",
      "Winning trades ÷ all closed trades (net of fees).",
      w.win_rate,
      (v) => formatPct(v, { decimals: 1 }),
      "up",
      `${formatInt(report.stats.winning_trades)} trades`,
    ),
    item(
      "avg_win",
      "Average win",
      "Mean net profit of the winning trades, with the mean return on notional below.",
      w.avg_win,
      (v) => formatPnl(v),
      "up",
      isNum(w.avg_win_pct) ? formatPct(w.avg_win_pct, { signed: true }) : undefined,
    ),
    item(
      "largest_win",
      "Largest win",
      "The single most profitable closed trade in the range.",
      w.largest_win,
      (v) => formatPnl(v),
      "up",
    ),
    item(
      "loss_rate",
      "Loss rate",
      "Losing trades ÷ all closed trades. Breakeven trades are in neither rate.",
      w.loss_rate,
      (v) => formatPct(v, { decimals: 1 }),
      "down",
      `${formatInt(report.stats.losing_trades)} trades`,
    ),
    item(
      "avg_loss",
      "Average loss",
      "Mean net loss of the losing trades, with the mean return on notional below.",
      w.avg_loss,
      (v) => formatPnl(v),
      "down",
      isNum(w.avg_loss_pct) ? formatPct(w.avg_loss_pct, { signed: true }) : undefined,
    ),
    item(
      "largest_loss",
      "Largest loss",
      "The single worst closed trade in the range.",
      w.largest_loss,
      (v) => formatPnl(v),
      "down",
    ),
  ];
}

// ---------------------------------------------------------------- win / loss split

export interface SplitSegment {
  key: "win" | "breakeven" | "loss";
  label: string;
  count: number;
  /** Share of all trades, 0–100. */
  pct: number;
  tone: Tone;
}

export function winLossSplit(
  stats: Pick<TradingStats, "winning_trades" | "losing_trades" | "breakeven_trades" | "total_trades">,
): SplitSegment[] {
  const total = stats.total_trades;
  const seg = (key: SplitSegment["key"], label: string, count: number, tone: Tone): SplitSegment => ({
    key,
    label,
    count,
    pct: total > 0 ? (count / total) * 100 : 0,
    tone,
  });
  return [
    seg("win", "Wins", stats.winning_trades, "up"),
    seg("breakeven", "Breakeven", stats.breakeven_trades, "muted"),
    seg("loss", "Losses", stats.losing_trades, "down"),
  ].filter((s) => s.count > 0);
}

// ---------------------------------------------------------------- monthly heatmap

export interface MonthCell {
  /** "YYYY-MM" */
  month: string;
  /** 1–12 */
  index: number;
  data: MonthlyReturn | null;
}

export interface YearRow {
  year: string;
  cells: MonthCell[];
}

/** One row per calendar year with all twelve months (missing months have `data: null`). */
export function groupMonthly(monthly: readonly MonthlyReturn[]): YearRow[] {
  const byMonth = new Map(monthly.map((m) => [m.month, m] as const));
  const years = [...new Set(monthly.map((m) => m.month.slice(0, 4)))].sort();
  return years.map((year) => ({
    year,
    cells: Array.from({ length: 12 }, (_, i) => {
      const month = `${year}-${String(i + 1).padStart(2, "0")}`;
      return { month, index: i + 1, data: byMonth.get(month) ?? null };
    }),
  }));
}

/** 0–1 colour strength for a return, relative to the largest absolute return (floor keeps tiny values visible). */
export function heatIntensity(returnPct: number, maxAbs: number): number {
  if (!isNum(returnPct) || !isNum(maxAbs) || maxAbs <= 0) return 0;
  return Math.max(0.12, Math.min(1, Math.abs(returnPct) / maxAbs));
}

export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// ---------------------------------------------------------------- distribution

const edge = (v: number) => formatNumber(v, Number.isInteger(v) ? 0 : 1, {}).replace("-", MINUS);

/** Compact x-axis label for a histogram bin: "< −5", "−1…−0.5", "≥ 5" (percent of notional). */
export function shortBinLabel(bin: Pick<DistributionBin, "min" | "max">): string {
  if (bin.min <= -1e8) return `< ${edge(bin.max)}`;
  if (bin.max >= 1e8) return `≥ ${edge(bin.min)}`;
  return `${edge(bin.min)}…${edge(bin.max)}`;
}

/** Bins on the loss side of zero (max ≤ 0) are losses, the rest wins. */
export function binTone(bin: Pick<DistributionBin, "min" | "max">): "up" | "down" {
  return bin.max <= 0 ? "down" : "up";
}

// ---------------------------------------------------------------- tables

/** Evenly thin a long series to at most `max` rows, keeping the first and last. */
export function thinRows<T>(rows: readonly T[], max: number): T[] {
  if (rows.length <= max || max < 3) return [...rows];
  const step = (rows.length - 1) / (max - 1);
  const out = Array.from({ length: max - 1 }, (_, i) => rows[Math.round(i * step)]);
  out.push(rows[rows.length - 1]);
  return out;
}

/** True when the report has nothing to chart or tabulate (no trades and a flat/short curve). */
export function isEmptyReport(report: PerformanceReport): boolean {
  return report.stats.total_trades === 0 && report.equity_curve.length < 2;
}

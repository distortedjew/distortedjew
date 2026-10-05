/**
 * Recharts defaults: spread these onto axes / grid so every analytics chart looks the same.
 *
 *   const theme = useChartTheme();
 *   const anim = useChartAnimation();
 *   <ResponsiveContainer width="100%" height="100%">
 *     <AreaChart data={points} margin={CHART_MARGIN}>
 *       <CartesianGrid {...gridProps(theme)} />
 *       <XAxis dataKey="time" {...xAxisProps(theme)} tickFormatter={tickFormatters.dateFromUnix} />
 *       <YAxis {...yAxisProps(theme)} tickFormatter={tickFormatters.usdCompact} />
 *       <Tooltip cursor={lineCursor(theme)} content={<ChartTooltipContent valueFormatter={(v) => formatUsd(v)} />} />
 *       <Area dataKey="equity" stroke={theme.series[0]} fill={theme.series[0]} fillOpacity={0.1} strokeWidth={2} {...anim} />
 *     </AreaChart>
 *   </ResponsiveContainer>
 *
 * Mark specs: lines 2px, area wash ~10 %, bars ≤ 24px with 4px rounded data end
 * (`radius={BAR_RADIUS}`), solid hairline grid, no dual axes.
 */
import { useReducedMotion } from "framer-motion";
import { formatCompact, formatDate, formatNumber, formatPct, formatTime, formatUsd } from "@/lib/format";
import type { ChartTheme } from "@/components/charts/chart-theme";

/** Right margin leaves room for the last x tick label (centered on the last point). */
export const CHART_MARGIN = { top: 8, right: 16, bottom: 0, left: 0 } as const;

/** Rounded data end, square at the baseline: [topLeft, topRight, bottomRight, bottomLeft]. */
export const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
/** For bars that can be negative, round both ends a little. */
export const BAR_RADIUS_SIGNED: [number, number, number, number] = [3, 3, 3, 3];
export const MAX_BAR_SIZE = 24;

function tick(theme: ChartTheme) {
  return { fill: theme.axis, fontSize: theme.fontSize, fontFamily: theme.monoFamily };
}

export function xAxisProps(theme: ChartTheme) {
  return {
    tick: tick(theme),
    tickLine: false,
    axisLine: { stroke: theme.axisLine },
    tickMargin: 8,
    minTickGap: 28,
    height: 28,
  } as const;
}

export function yAxisProps(theme: ChartTheme) {
  return {
    tick: tick(theme),
    tickLine: false,
    axisLine: false,
    tickMargin: 6,
    width: 58,
  } as const;
}

/** Solid hairline horizontal grid (never dashed). */
export function gridProps(theme: ChartTheme) {
  return { stroke: theme.grid, vertical: false } as const;
}

/** Vertical crosshair for line / area charts. */
export function lineCursor(theme: ChartTheme) {
  return { stroke: theme.crosshair, strokeWidth: 1 } as const;
}

/** Soft column highlight for bar charts. */
export function barCursor(theme: ChartTheme) {
  return { fill: theme.mode === "dark" ? "rgba(148,163,184,0.06)" : "rgba(15,23,42,0.04)" } as const;
}

/** Hairline reference line at zero (P&L charts). */
export function zeroLineProps(theme: ChartTheme) {
  return { y: 0, stroke: theme.axisLine, strokeWidth: 1, ifOverflow: "extendDomain" } as const;
}

/** Tick formatters (Recharts passes the raw value). */
export const tickFormatters = {
  usd: (v: number) => formatUsd(v, { decimals: 0 }),
  usdCompact: (v: number) => formatUsd(v, { compact: true, decimals: Math.abs(v) >= 1_000 ? 1 : 0 }),
  pnlCompact: (v: number) => formatUsd(v, { compact: true, signed: true, decimals: Math.abs(v) >= 1_000 ? 1 : 0 }),
  /** Values already in percent units. */
  pct: (v: number) => formatPct(v, { decimals: Math.abs(v) >= 10 ? 0 : 1 }),
  pctSigned: (v: number) => formatPct(v, { decimals: Math.abs(v) >= 10 ? 0 : 1, signed: true }),
  number: (v: number) => formatNumber(v, Number.isInteger(v) || Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2),
  compact: (v: number) => formatCompact(v),
  /** Unix seconds → "Oct 4". */
  dateFromUnix: (v: number) => formatDate(v * 1_000),
  /** Unix seconds → "14:30". */
  timeFromUnix: (v: number) => formatTime(v * 1_000, { seconds: false }),
  /** ISO date / datetime string → "Oct 4". */
  dateFromIso: (v: string) => formatDate(v),
};

/** Chart enter animation that respects prefers-reduced-motion. Spread onto series. */
export function useChartAnimation() {
  const reduce = useReducedMotion();
  return { isAnimationActive: !reduce, animationDuration: 450, animationEasing: "ease-out" } as const;
}

import { useId, useState, type PointerEvent } from "react";
import { useElementSize } from "@/hooks/use-element-size";
import { cn } from "@/lib/cn";
import type { Tone } from "@/types";
import { toneColor, useChartTheme } from "@/components/charts/chart-theme";

export interface SparklineProps {
  data: readonly number[];
  /** Height in px (default 32). Width fills the container unless `width` is set. */
  height?: number;
  width?: number;
  /**
   * Mark color. "auto" (default) = direction of the window (last vs first → up / down / neutral),
   * for ticker rows where the line IS the trend signal. "deemphasis" = quiet gray context line;
   * combine with `highlightLast` for the stat-tile (KPI) style.
   */
  tone?: Tone | "auto" | "deemphasis";
  /** For "auto": lower is better (drawdown, losses). */
  invert?: boolean;
  /** line (default) or bars (daily P&L / counts; colored by sign when tone is "auto"). */
  variant?: "line" | "bars";
  /** Soft area wash under the line (default true). */
  area?: boolean;
  /** Line width in px (default 2). */
  strokeWidth?: number;
  /** Dot on the latest point (default true). */
  endDot?: boolean;
  /** Emphasis form: the current period (last point / bar) in the accent, the rest as given by `tone`. */
  highlightLast?: boolean;
  /** Enables a hover readout: crosshair + value (+ label). */
  formatValue?: (value: number) => string;
  /** Per-point labels for the hover readout (e.g. dates), aligned with `data`. */
  labels?: readonly string[];
  className?: string;
  "aria-label"?: string;
}

const PAD_TOP = 5;
const PAD_BOTTOM = 4;
const PAD_LEFT = 1;
const PAD_RIGHT = 6;
/** End dot: ≥ 8px mark with a 2px ring in the surface color (dataviz mark spec). */
const DOT_R = 4;
const DOT_RING = 2;

/**
 * Tiny trend chart for KPI cards and tables: SVG, no axes.
 *
 *   <Sparkline data={kpi.sparkline} tone="deemphasis" highlightLast />   // KPI tile (stat-tile style)
 *   <Sparkline data={ticker.sparkline} />                                // watchlist row: colored by direction
 *   <Sparkline data={dailyPnl} variant="bars" />                         // bars colored by sign
 */
export function Sparkline({
  data,
  height = 32,
  width: fixedWidth,
  tone = "auto",
  invert,
  variant = "line",
  area = true,
  strokeWidth = 2,
  endDot = true,
  highlightLast = false,
  formatValue,
  labels,
  className,
  ...aria
}: SparklineProps) {
  const theme = useChartTheme();
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const width = fixedWidth ?? size.width;

  // Keep labels aligned with the finite points that are actually drawn.
  const kept = data.flatMap((v, i) => (Number.isFinite(v) ? [{ v, label: labels?.[i] }] : []));
  const points = kept.map((p) => p.v);
  const n = points.length;
  const first = points[0] ?? 0;
  const last = points[n - 1] ?? 0;

  const direction: Tone = last > first ? "up" : last < first ? "down" : "neutral";
  const resolvedTone: Tone | "deemphasis" =
    tone === "auto"
      ? invert
        ? direction === "up"
          ? "down"
          : direction === "down"
            ? "up"
            : "neutral"
        : direction
      : tone;
  const color = resolvedTone === "deemphasis" ? theme.deemphasis : toneColor(theme, resolvedTone);
  const lastColor = highlightLast ? theme.accent : color;

  let min = Math.min(...points);
  let max = Math.max(...points);
  if (variant === "bars") {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  const span = max - min || 1;
  const innerH = height - PAD_TOP - PAD_BOTTOM;
  const innerW = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const y = (v: number) => (max === min ? PAD_TOP + innerH / 2 : PAD_TOP + (1 - (v - min) / span) * innerH);

  const slot = variant === "bars" ? innerW / Math.max(1, n) : innerW / Math.max(1, n - 1);
  const x = (i: number) => (variant === "bars" ? PAD_LEFT + slot * (i + 0.5) : PAD_LEFT + slot * i);

  const label = aria["aria-label"] ?? (n ? `Trend over ${n} points` : "No trend data");

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!formatValue || n === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const i = variant === "bars" ? Math.floor((px - PAD_LEFT) / slot) : Math.round((px - PAD_LEFT) / slot);
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  let body = null;
  if (width > 0 && n >= 2 && variant === "line") {
    const line = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
    const areaPath = `${line}L${x(n - 1).toFixed(2)},${height}L${x(0).toFixed(2)},${height}Z`;
    body = (
      <>
        {area ? (
          <>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={highlightLast ? 0.14 : 0.2} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
          </>
        ) : null}
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {endDot && hover === null ? (
          <circle
            cx={x(n - 1)}
            cy={y(last)}
            r={DOT_R}
            fill={lastColor}
            stroke={theme.background}
            strokeWidth={DOT_RING}
          />
        ) : null}
      </>
    );
  } else if (width > 0 && n >= 1 && variant === "bars") {
    const zero = y(0);
    // ≤ 6px bars with a ≥ 2px surface gap between neighbours.
    const barW = Math.max(1.5, Math.min(6, slot - 2));
    body = (
      <>
        <line
          x1={PAD_LEFT}
          x2={width - PAD_RIGHT + 2}
          y1={zero}
          y2={zero}
          stroke={theme.axisLine}
          strokeWidth={1}
        />
        {points.map((v, i) => {
          if (v === 0) return null; // the baseline already shows zero
          const top = Math.min(zero, y(v));
          const h = Math.max(1, Math.abs(y(v) - zero));
          const isLast = i === n - 1;
          const fill =
            highlightLast && isLast
              ? theme.accent
              : tone === "auto"
                ? v >= 0
                  ? theme.up
                  : theme.down
                : color;
          return (
            <rect
              key={i}
              x={x(i) - barW / 2}
              y={top}
              width={barW}
              height={h}
              rx={Math.min(1.5, barW / 2)}
              fill={fill}
              opacity={hover === null || hover === i ? 1 : 0.45}
            />
          );
        })}
      </>
    );
  } else if (width > 0) {
    // Not enough data: a faint flat rule so the layout does not jump.
    body = (
      <line
        x1={PAD_LEFT}
        x2={width - PAD_RIGHT}
        y1={height / 2}
        y2={height / 2}
        stroke={theme.grid}
        strokeWidth={1}
      />
    );
  }

  const hoverValue = hover !== null ? points[hover] : undefined;
  const hoverLabel = hover !== null ? kept[hover]?.label : undefined;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className={cn("relative w-full", className)}
      style={{ height, width: fixedWidth }}
    >
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden
          className="block overflow-visible"
          onPointerMove={formatValue ? onMove : undefined}
          onPointerLeave={formatValue ? () => setHover(null) : undefined}
        >
          {body}
          {hover !== null && hoverValue !== undefined && variant === "line" ? (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={0} y2={height} stroke={theme.crosshair} strokeWidth={1} />
              <circle
                cx={x(hover)}
                cy={y(hoverValue)}
                r={DOT_R}
                fill={hover === n - 1 ? lastColor : color}
                stroke={theme.background}
                strokeWidth={DOT_RING}
              />
            </>
          ) : null}
        </svg>
      ) : null}
      {formatValue && hover !== null && hoverValue !== undefined ? (
        <div
          className="pointer-events-none absolute -top-7 z-10 rounded-md surface-elevated px-1.5 py-0.5 text-[10.5px] whitespace-nowrap text-fg"
          style={{
            left: Math.max(0, Math.min(width - 4, x(hover))),
            transform: `translateX(${x(hover) > width * 0.6 ? "-100%" : x(hover) < width * 0.25 ? "0" : "-50%"})`,
          }}
        >
          <span className="num font-medium">{formatValue(hoverValue)}</span>
          {hoverLabel ? <span className="ml-1.5 text-fg-subtle">{hoverLabel}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

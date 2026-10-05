/**
 * Chart theme tokens — one source of truth for every chart (Recharts, SVG sparklines and the
 * TradingView Lightweight Charts canvas, which cannot read CSS variables).
 * Values mirror src/index.css; keep both in sync.
 *
 * Color method (dataviz skill, validated with its six-checks script):
 * - `series` = categorical identity slots, FIXED order, never cycled; 6 slots validated in both
 *   modes (adjacent CVD ΔE ≥ 9.2 light / 9.4 dark, normal-vision ΔE ≥ 19); the first 3 also pass
 *   the all-pairs test (scatter / small multiples cap at 3 series). Green and red are left out
 *   because they mean profit / loss here. Light-mode slots 2, 3, 6 sit below 3:1 on white →
 *   label those series directly or offer a table view.
 * - `up` / `down` = profit / loss, bull / bear (a polarity pair, CVD ΔE only ~6): ALWAYS pair with
 *   a sign, ▲/▼ or position (above/below zero) — never color alone.
 * - `deemphasis` + `accent` = the emphasis form: context in gray, the one thing that matters
 *   (the current period on a stat-tile sparkline, the highlighted series) in the accent.
 * - Grid and axes are solid hairlines one step off the surface; never dashed.
 */
import { useTheme, type ThemeMode } from "@/lib/theme";
import type { ChartMarkerKind, PriceLevelKind, Tone } from "@/types";

export interface ChartTheme {
  mode: ThemeMode;
  /** Card surface the chart renders on. */
  background: string;
  canvas: string;
  text: string;
  textMuted: string;
  /** Tick labels. */
  axis: string;
  /** Baseline / axis rule. */
  axisLine: string;
  /** Hairline gridlines. */
  grid: string;
  crosshair: string;
  tooltip: { background: string; border: string; text: string; muted: string };
  /** Profit / bullish marks (candles, positive bars). */
  up: string;
  /** Loss / bearish marks. */
  down: string;
  /** ~10 % washes for areas under up / down series. */
  upFill: string;
  downFill: string;
  neutral: string;
  /** De-emphasis gray for context marks (stat-tile sparklines, "the rest" in an emphasis chart); ≥ 3:1. */
  deemphasis: string;
  accent: string;
  ai: string;
  warning: string;
  info: string;
  /** Categorical identity slots, fixed order (series[0] first). */
  series: readonly [string, string, string, string, string, string];
  /** Candlestick overlay lines (identity colors from `series`, in slot order). */
  overlays: {
    ema9: string;
    ema21: string;
    ema50: string;
    ema200: string;
    vwap: string;
    bbLine: string;
    bbMiddle: string;
    bbFill: string;
  };
  volumeUp: string;
  volumeDown: string;
  fontFamily: string;
  monoFamily: string;
  /** Axis / tick font size (px). */
  fontSize: number;
}

const FONT_SANS = '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif';
const FONT_MONO = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

const DARK_SERIES = ["#3987e5", "#d55181", "#c98500", "#9085e9", "#d95926", "#199e70"] as const;
const LIGHT_SERIES = ["#2a78d6", "#e87ba4", "#eda100", "#4a3aa7", "#eb6834", "#1baf7a"] as const;

export const CHART_THEMES: Record<ThemeMode, ChartTheme> = {
  dark: {
    mode: "dark",
    background: "#0d1219",
    canvas: "#07090d",
    text: "#e7ebf3",
    textMuted: "#98a2b3",
    axis: "#7d879a",
    axisLine: "rgba(148, 163, 184, 0.22)",
    grid: "rgba(148, 163, 184, 0.08)",
    crosshair: "rgba(152, 162, 179, 0.5)",
    tooltip: { background: "#121823", border: "rgba(148, 163, 184, 0.2)", text: "#e7ebf3", muted: "#98a2b3" },
    up: "#2ebd85",
    down: "#f6465d",
    upFill: "rgba(46, 189, 133, 0.10)",
    downFill: "rgba(246, 70, 93, 0.10)",
    neutral: "#7d879a",
    deemphasis: "#646e80",
    accent: "#7c8cff",
    ai: "#a78bfa",
    warning: "#f0b90b",
    info: "#4c9dff",
    series: DARK_SERIES,
    overlays: {
      ema9: DARK_SERIES[0],
      ema21: DARK_SERIES[1],
      ema50: DARK_SERIES[2],
      ema200: DARK_SERIES[3],
      vwap: DARK_SERIES[4],
      bbLine: "rgba(152, 162, 179, 0.45)",
      bbMiddle: "rgba(152, 162, 179, 0.3)",
      bbFill: "rgba(152, 162, 179, 0.05)",
    },
    volumeUp: "rgba(46, 189, 133, 0.24)",
    volumeDown: "rgba(246, 70, 93, 0.24)",
    fontFamily: FONT_SANS,
    monoFamily: FONT_MONO,
    fontSize: 11,
  },
  light: {
    mode: "light",
    background: "#ffffff",
    canvas: "#f5f7fb",
    text: "#0f172a",
    textMuted: "#475467",
    axis: "#626d81",
    axisLine: "#d0d5dd",
    grid: "#eef0f4",
    crosshair: "rgba(71, 84, 103, 0.45)",
    tooltip: { background: "#ffffff", border: "#e4e7ee", text: "#0f172a", muted: "#475467" },
    // Marks may be brighter than the text tokens: they need 3:1 on white, text needs 4.5:1.
    up: "#0e9f6e",
    down: "#e5484d",
    upFill: "rgba(14, 159, 110, 0.10)",
    downFill: "rgba(229, 72, 77, 0.10)",
    neutral: "#98a2b3",
    deemphasis: "#8a94a6",
    accent: "#4f5bd5",
    ai: "#7c3aed",
    warning: "#d99a00",
    info: "#1a68d6",
    series: LIGHT_SERIES,
    overlays: {
      ema9: LIGHT_SERIES[0],
      ema21: LIGHT_SERIES[1],
      ema50: LIGHT_SERIES[2],
      ema200: LIGHT_SERIES[3],
      vwap: LIGHT_SERIES[4],
      bbLine: "rgba(71, 84, 103, 0.4)",
      bbMiddle: "rgba(71, 84, 103, 0.25)",
      bbFill: "rgba(71, 84, 103, 0.05)",
    },
    volumeUp: "rgba(14, 159, 110, 0.22)",
    volumeDown: "rgba(229, 72, 77, 0.22)",
    fontFamily: FONT_SANS,
    monoFamily: FONT_MONO,
    fontSize: 11,
  },
};

export function getChartTheme(mode: ThemeMode): ChartTheme {
  return CHART_THEMES[mode];
}

/** The chart theme for the current dark/light mode; re-renders when the theme changes. */
export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();
  return CHART_THEMES[theme];
}

/** Mark color for a semantic tone (sparklines, bars, dots). */
export function toneColor(theme: ChartTheme, tone: Tone): string {
  switch (tone) {
    case "up":
      return theme.up;
    case "down":
      return theme.down;
    case "warning":
      return theme.warning;
    case "info":
      return theme.info;
    case "accent":
      return theme.accent;
    case "ai":
      return theme.ai;
    case "muted":
      return theme.axis;
    default:
      return theme.textMuted;
  }
}

/** Color for a trade / signal marker on price charts. */
export function markerColor(theme: ChartTheme, kind: ChartMarkerKind): string {
  switch (kind) {
    case "entry_long":
    case "exit_win":
    case "take_profit":
      return theme.up;
    case "entry_short":
    case "exit_loss":
    case "stop_loss":
      return theme.down;
    case "signal_long":
    case "signal_short":
      return theme.ai;
    default:
      return theme.textMuted;
  }
}

/** Color for an open position's price level line. */
export function levelColor(theme: ChartTheme, kind: PriceLevelKind): string {
  if (kind === "take_profit") return theme.up;
  if (kind === "stop_loss") return theme.down;
  return theme.accent;
}

/** Color for a value's sign (P&L bars): up ≥ 0, down < 0. */
export function signColor(theme: ChartTheme, value: number): string {
  return value >= 0 ? theme.up : theme.down;
}

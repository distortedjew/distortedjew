/**
 * Pure helpers behind <CandlestickChart>: overlay definitions, live-candle merging and the
 * crosshair legend readout. Kept free of React / lightweight-charts so they are unit-tested.
 */
import type { ChartTheme } from "@/components/charts/chart-theme";
import type { AIAnalysis, Candle, ChartMarker, IndicatorSeries, PriceLevel, Timeframe } from "@/types";

/** Toggleable overlay groups ("bb" = Bollinger upper / middle / lower). */
export type OverlayKey = "ema9" | "ema21" | "ema50" | "ema200" | "vwap" | "bb";

/** One drawable line inside an overlay group (keys of IndicatorSeries / WS candle indicators). */
export type OverlayLineKey = keyof IndicatorSeries;

export interface OverlayDef {
  key: OverlayKey;
  label: string;
  /** Long description for tooltips. */
  description: string;
  lines: readonly OverlayLineKey[];
}

export const OVERLAY_DEFS: readonly OverlayDef[] = [
  {
    key: "ema9",
    label: "EMA 9",
    description: "9-period exponential moving average — the fastest trend line.",
    lines: ["ema9"],
  },
  {
    key: "ema21",
    label: "EMA 21",
    description: "21-period EMA — short-term trend; the bot's main trend filter with EMA 50.",
    lines: ["ema21"],
  },
  {
    key: "ema50",
    label: "EMA 50",
    description: "50-period EMA — medium-term trend.",
    lines: ["ema50"],
  },
  {
    key: "ema200",
    label: "EMA 200",
    description: "200-period EMA — long-term trend; price above it is a bullish backdrop.",
    lines: ["ema200"],
  },
  {
    key: "vwap",
    label: "VWAP",
    description: "Volume-weighted average price since the UTC session start.",
    lines: ["vwap"],
  },
  {
    key: "bb",
    label: "Bollinger",
    description:
      "Bollinger Bands (20, 2σ): the middle band is a 20-period SMA, the outer bands ±2 standard deviations.",
    lines: ["bb_upper", "bb_middle", "bb_lower"],
  },
];

export const OVERLAY_KEYS: readonly OverlayKey[] = OVERLAY_DEFS.map((d) => d.key);

export const ALL_OVERLAY_LINES: readonly OverlayLineKey[] = OVERLAY_DEFS.flatMap((d) => d.lines);

/** Default visible overlays on the Markets chart. */
export const DEFAULT_OVERLAYS: readonly OverlayKey[] = ["ema21", "ema50", "ema200"];

export const OVERLAY_LINE_LABEL: Record<OverlayLineKey, string> = {
  ema9: "EMA 9",
  ema21: "EMA 21",
  ema50: "EMA 50",
  ema200: "EMA 200",
  vwap: "VWAP",
  bb_upper: "BB upper",
  bb_middle: "BB mid",
  bb_lower: "BB lower",
};

export function overlayOfLine(line: OverlayLineKey): OverlayKey {
  return line.startsWith("bb_") ? "bb" : (line as OverlayKey);
}

/** Line color for an overlay line from the chart theme. */
export function overlayColor(theme: ChartTheme, line: OverlayLineKey): string {
  switch (line) {
    case "bb_upper":
    case "bb_lower":
      return theme.overlays.bbLine;
    case "bb_middle":
      return theme.overlays.bbMiddle;
    default:
      return theme.overlays[line];
  }
}

/** Legend swatch color for an overlay group. */
export function overlayGroupColor(theme: ChartTheme, key: OverlayKey): string {
  return key === "bb" ? theme.overlays.bbLine : theme.overlays[key];
}

export function isOverlayKey(value: unknown): value is OverlayKey {
  return typeof value === "string" && (OVERLAY_KEYS as readonly string[]).includes(value);
}

/** Parse a persisted overlay list, dropping unknown values; null when unusable. */
export function parseOverlayList(raw: string | null): OverlayKey[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return OVERLAY_KEYS.filter((k) => parsed.includes(k));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- live candles

/**
 * Merge a live (forming or closed) candle into a candle array. Returns the same array instance
 * when the frame is older than the last bar (out-of-order frames are ignored), otherwise a new
 * array where the last bar is replaced (same open time) or the candle is appended (new bar).
 */
export function mergeCandle(candles: readonly Candle[], candle: Candle): readonly Candle[] {
  const last = candles[candles.length - 1];
  if (!last) return [candle];
  if (candle.time < last.time) return candles;
  if (candle.time === last.time) {
    const next = candles.slice();
    next[next.length - 1] = candle;
    return next;
  }
  return [...candles, candle];
}

/** "apply" when a live candle may update the series, "ignore" for stale (older) frames. */
export function liveCandleAction(lastTime: number | undefined, candleTime: number): "apply" | "ignore" {
  if (lastTime === undefined) return "apply";
  return candleTime >= lastTime ? "apply" : "ignore";
}

// ---------------------------------------------------------------- legend

export interface LegendReadout {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  /** Close vs open of the bar, percent. */
  changePct: number;
  /** True when this is the latest bar (no crosshair). */
  latest: boolean;
  overlays: Partial<Record<OverlayLineKey, number>>;
}

export function legendFromBar(
  bar: { time: number; open: number; high: number; low: number; close: number },
  volume: number | null,
  overlays: Partial<Record<OverlayLineKey, number>>,
  latest: boolean,
): LegendReadout {
  const changePct = bar.open ? ((bar.close - bar.open) / bar.open) * 100 : 0;
  return { ...bar, volume, changePct, latest, overlays };
}

// ---------------------------------------------------------------- AI levels

/**
 * The AI's proposed entry / stop / target for a directional signal as chart price levels
 * (labelled "AI entry", "AI SL", "AI TP"). Empty for HOLD or missing levels.
 */
export function analysisLevels(analysis: AIAnalysis | null | undefined): PriceLevel[] {
  if (!analysis || analysis.signal === "HOLD") return [];
  const side = analysis.signal;
  const out: PriceLevel[] = [];
  const push = (kind: PriceLevel["kind"], price: number | null, label: string) => {
    if (price !== null && Number.isFinite(price))
      out.push({ kind, price, label, position_id: analysis.id, side });
  };
  push("entry", analysis.entry, "AI entry");
  push("stop_loss", analysis.stop_loss, "AI SL");
  push("take_profit", analysis.take_profit, "AI TP");
  return out;
}

/** "1D" for the daily timeframe, as traders write it. */
export function timeframeShort(tf: Timeframe): string {
  return tf === "1d" ? "1D" : tf;
}

/** How long the latest AI proposal stays drawn as "AI levels" (unless executed). */
const AI_LEVELS_MAX_AGE_SEC = 30 * 60;

/** AI-proposed levels worth drawing: recent, directional, not executed (positions draw their own). */
export function proposalLevels(
  analysis: AIAnalysis | null | undefined,
  symbol: string,
  nowMs: number,
): PriceLevel[] {
  if (!analysis || analysis.symbol !== symbol || analysis.trade_id) return [];
  const age = (nowMs - Date.parse(analysis.created_at)) / 1_000;
  if (!(age >= -60 && age <= AI_LEVELS_MAX_AGE_SEC)) return [];
  return analysisLevels(analysis);
}

// ---------------------------------------------------------------- marker labels

/** Bar spacing (px) from which marker labels have room next to each other. */
export const LABEL_MIN_BAR_SPACING = 14;
/** With this few markers in view, labels are drawn at any zoom. */
export const LABEL_MAX_SPARSE_MARKERS = 6;

/**
 * Marker text is drawn only when it cannot pile up: zoomed in far enough, or few markers in view.
 * Otherwise markers show as shapes and their labels move into the crosshair legend.
 */
export function shouldLabelMarkers(barSpacing: number, visibleMarkers: number): boolean {
  return barSpacing >= LABEL_MIN_BAR_SPACING || visibleMarkers <= LABEL_MAX_SPARSE_MARKERS;
}

/** Number of markers whose time falls inside [from, to] (unix seconds). */
export function countMarkersInRange(markers: readonly ChartMarker[], from: number, to: number): number {
  let n = 0;
  for (const m of markers) if (m.time >= from && m.time <= to) n += 1;
  return n;
}

/** Markers on one bar (for the crosshair legend). */
export function markersAt(markers: readonly ChartMarker[], time: number): ChartMarker[] {
  return markers.filter((m) => m.time === time);
}

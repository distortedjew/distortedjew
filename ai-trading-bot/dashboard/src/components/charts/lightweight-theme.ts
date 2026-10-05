/**
 * TradingView Lightweight Charts (v5) options and data mappers derived from the chart theme.
 * Import from this file directly (not the charts barrel) so lightweight-charts only loads on pages
 * that draw price charts. Every candlestick chart (Markets, position / trade detail) uses these,
 * so candles, overlays, markers and position levels look identical everywhere.
 *
 *   const theme = useChartTheme();
 *   const chart = createChart(el, lwChartOptions(theme));
 *   const candles = chart.addSeries(CandlestickSeries, lwCandleOptions(theme));
 *   candles.setData(snapshot.candles.map(lwCandle));
 *   const volume = chart.addSeries(HistogramSeries, lwVolumeOptions());
 *   chart.priceScale("volume").applyOptions(lwVolumeScaleOptions());
 *   volume.setData(snapshot.candles.map((c) => lwVolumeBar(c, theme)));
 *   createSeriesMarkers(candles, lwMarkers(theme, snapshot.markers, snapshot.candles));
 *   snapshot.levels.forEach((level) => candles.createPriceLine(lwPriceLine(theme, level)));
 *   useEffect(() => chart.applyOptions(lwChartOptions(theme)), [theme]);   // theme switch
 *
 * Times: the API sends unix seconds (UTC); the axis and crosshair labels are rendered in the
 * viewer's local time by the formatters below, matching every other timestamp in the app.
 */
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  type CandlestickData,
  type CandlestickSeriesPartialOptions,
  type ChartOptions,
  type CreatePriceLineOptions,
  type DeepPartial,
  type HistogramData,
  type HistogramSeriesPartialOptions,
  type LineData,
  type LineSeriesPartialOptions,
  type PriceScaleOptions,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { formatPrice } from "@/lib/format";
import type { Candle, ChartMarker, LinePoint, PriceLevel } from "@/types";
import { levelColor, markerColor, type ChartTheme } from "@/components/charts/chart-theme";

// ---------------------------------------------------------------- time labels (local time)

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function timeToDate(time: Time): Date {
  if (typeof time === "number") return new Date(time * 1_000);
  if (typeof time === "string") return new Date(time);
  return new Date(time.year, time.month - 1, time.day);
}

/** Axis tick labels in local time: "2026", "Oct", "Oct 4", "14:30", "14:30:05". */
export function lwTickMarkFormatter(time: Time, type: TickMarkType): string {
  const d = timeToDate(time);
  switch (type) {
    case TickMarkType.Year:
      return String(d.getFullYear());
    case TickMarkType.Month:
      return MONTHS[d.getMonth()];
    case TickMarkType.DayOfMonth:
      return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    case TickMarkType.TimeWithSeconds:
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    default:
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

/** Crosshair time label in local time: "Sat Oct 4 '26 14:30". */
export function lwTimeFormatter(time: Time): string {
  const d = timeToDate(time);
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${day} ${MONTHS[d.getMonth()]} ${d.getDate()} '${String(d.getFullYear()).slice(2)}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------- chart + series options

export function lwChartOptions(theme: ChartTheme): DeepPartial<ChartOptions> {
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: theme.background },
      textColor: theme.axis,
      fontFamily: theme.monoFamily,
      fontSize: theme.fontSize,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: theme.grid, style: LineStyle.Solid },
      horzLines: { color: theme.grid, style: LineStyle.Solid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: theme.crosshair,
        width: 1,
        style: LineStyle.Solid,
        labelBackgroundColor: theme.tooltip.background,
      },
      horzLine: {
        color: theme.crosshair,
        width: 1,
        style: LineStyle.Solid,
        labelBackgroundColor: theme.tooltip.background,
      },
    },
    rightPriceScale: { borderColor: theme.axisLine, scaleMargins: { top: 0.08, bottom: 0.2 } },
    leftPriceScale: { borderColor: theme.axisLine },
    timeScale: {
      borderColor: theme.axisLine,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 6,
      barSpacing: 8,
      tickMarkFormatter: lwTickMarkFormatter,
    },
    localization: {
      priceFormatter: (price: number) => formatPrice(price),
      timeFormatter: lwTimeFormatter,
    },
  };
}

export function lwCandleOptions(theme: ChartTheme): CandlestickSeriesPartialOptions {
  return {
    upColor: theme.up,
    downColor: theme.down,
    borderUpColor: theme.up,
    borderDownColor: theme.down,
    wickUpColor: theme.up,
    wickDownColor: theme.down,
    priceLineColor: theme.crosshair,
  };
}

/** Volume histogram on its own overlay scale ("volume"); pair with lwVolumeScaleOptions(). */
export function lwVolumeOptions(): HistogramSeriesPartialOptions {
  return {
    priceFormat: { type: "volume" },
    priceScaleId: "volume",
    lastValueVisible: false,
    priceLineVisible: false,
  };
}

/** `chart.priceScale("volume").applyOptions(lwVolumeScaleOptions())` — bottom ~16 % of the pane. */
export function lwVolumeScaleOptions(): DeepPartial<PriceScaleOptions> {
  return { scaleMargins: { top: 0.84, bottom: 0 } };
}

/** Thin overlay line (EMA, VWAP, Bollinger) — pass a color from theme.overlays. */
export function lwOverlayOptions(color: string, opts: { width?: 1 | 2; title?: string } = {}): LineSeriesPartialOptions {
  return {
    color,
    lineWidth: opts.width ?? 1,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
    title: opts.title ?? "",
  };
}

// ---------------------------------------------------------------- data mappers

/** API candle → candlestick bar (time is already unix seconds). */
export function lwCandle(candle: Candle): CandlestickData<Time> {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

/** API candle → volume bar colored by the candle's direction. */
export function lwVolumeBar(candle: Candle, theme: ChartTheme): HistogramData<Time> {
  return {
    time: candle.time as UTCTimestamp,
    value: candle.volume,
    color: candle.close >= candle.open ? theme.volumeUp : theme.volumeDown,
  };
}

/** API line point (overlay series) → line data. */
export function lwLinePoint(point: LinePoint): LineData<Time> {
  return { time: point.time as UTCTimestamp, value: point.value };
}

/**
 * API chart markers → series markers (sorted by time, as the library requires).
 * Entries and AI signals are arrows outside the bar (long below, short above). Exits are a circle
 * (win / loss) or a square (stop loss / take profit); pass the chart's `candles` and they sit
 * above or below the bar on the side their fill price is (labels never cover candles), otherwise
 * at the exact fill price.
 */
export function lwMarkers(
  theme: ChartTheme,
  markers: readonly ChartMarker[],
  candles?: readonly Candle[],
): SeriesMarker<Time>[] {
  const byTime = candles ? new Map(candles.map((c) => [c.time, c])) : null;
  return [...markers]
    .sort((a, b) => a.time - b.time)
    .map((m): SeriesMarker<Time> => {
      const base = {
        time: m.time as UTCTimestamp,
        color: markerColor(theme, m.kind),
        text: m.label,
        // `<trade id>:<kind>` — unique per marker; split on ":" to find the trade on click.
        id: m.trade_id ? `${m.trade_id}:${m.kind}` : undefined,
      };
      switch (m.kind) {
        case "entry_long":
          return { ...base, position: "belowBar", shape: "arrowUp" };
        case "entry_short":
          return { ...base, position: "aboveBar", shape: "arrowDown" };
        case "signal_long":
          return { ...base, position: "belowBar", shape: "arrowUp", size: 0.8 };
        case "signal_short":
          return { ...base, position: "aboveBar", shape: "arrowDown", size: 0.8 };
        default: {
          const shape = m.kind === "stop_loss" || m.kind === "take_profit" ? "square" : "circle";
          const candle = byTime?.get(m.time);
          if (candle) {
            const above = m.price >= (candle.high + candle.low) / 2;
            return { ...base, position: above ? "aboveBar" : "belowBar", shape, size: 0.8 };
          }
          return { ...base, position: "atPriceMiddle", price: m.price, shape, size: 0.8 };
        }
      }
    });
}

/** An open position's entry / stop / target as a price line (`series.createPriceLine(...)`). */
export function lwPriceLine(theme: ChartTheme, level: PriceLevel): CreatePriceLineOptions {
  const color = levelColor(theme, level.kind);
  return {
    id: `${level.position_id}:${level.kind}`,
    price: level.price,
    color,
    lineWidth: 1,
    lineStyle: level.kind === "entry" ? LineStyle.Solid : LineStyle.Dashed,
    axisLabelVisible: true,
    title: level.label,
    axisLabelColor: color,
    axisLabelTextColor: theme.mode === "dark" ? "#07090d" : "#ffffff",
  };
}

/**
 * TradingView Lightweight Charts (v5) options derived from the chart theme. Import from this file
 * directly (not the charts barrel) so lightweight-charts only loads on pages that draw price charts.
 *
 *   const theme = useChartTheme();
 *   const chart = createChart(el, lwChartOptions(theme));
 *   const candles = chart.addSeries(CandlestickSeries, lwCandleOptions(theme));
 *   useEffect(() => chart.applyOptions(lwChartOptions(theme)), [theme]);   // theme switch
 */
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  type CandlestickSeriesPartialOptions,
  type ChartOptions,
  type DeepPartial,
  type HistogramSeriesPartialOptions,
  type LineSeriesPartialOptions,
} from "lightweight-charts";
import { formatPrice } from "@/lib/format";
import type { ChartTheme } from "@/components/charts/chart-theme";

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
      vertLine: { color: theme.crosshair, width: 1, style: LineStyle.Solid, labelBackgroundColor: theme.tooltip.background },
      horzLine: { color: theme.crosshair, width: 1, style: LineStyle.Solid, labelBackgroundColor: theme.tooltip.background },
    },
    rightPriceScale: { borderColor: theme.axisLine, scaleMargins: { top: 0.08, bottom: 0.2 } },
    leftPriceScale: { borderColor: theme.axisLine },
    timeScale: {
      borderColor: theme.axisLine,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 6,
      barSpacing: 8,
    },
    localization: {
      priceFormatter: (price: number) => formatPrice(price),
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

/** Volume histogram on its own overlay scale at the bottom 20 % of the pane. */
export function lwVolumeOptions(): HistogramSeriesPartialOptions {
  return {
    priceFormat: { type: "volume" },
    priceScaleId: "volume",
    lastValueVisible: false,
    priceLineVisible: false,
  };
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

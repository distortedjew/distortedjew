import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { useChartTheme } from "@/components/charts/chart-theme";
import { ChartCard } from "@/components/charts/ChartCard";
import {
  lwCandle,
  lwCandleOptions,
  lwChartOptions,
  lwLinePoint,
  lwMarkers,
  lwOverlayOptions,
  lwPriceLine,
  lwVolumeBar,
  lwVolumeOptions,
  lwVolumeScaleOptions,
} from "@/components/charts/lightweight-theme";
import { SAMPLE_MARKET } from "@/pages/design/sample-data";

interface ChartApis {
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  ema: ISeriesApi<"Line">;
  markers: ISeriesMarkersPluginApi<Time>;
  lines: IPriceLine[];
}

/**
 * Reference wiring of the lightweight-theme helpers (dev showcase only — the product chart lives in
 * features/market): create once, re-theme in place, remove on unmount.
 */
export function LightweightSample() {
  const theme = useChartTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const apisRef = useRef<ChartApis | null>(null);
  const initialTheme = useRef(theme);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const t = initialTheme.current;
    const chart = createChart(el, lwChartOptions(t));
    const candles = chart.addSeries(CandlestickSeries, lwCandleOptions(t));
    const volume = chart.addSeries(HistogramSeries, lwVolumeOptions());
    chart.priceScale("volume").applyOptions(lwVolumeScaleOptions());
    const ema = chart.addSeries(LineSeries, lwOverlayOptions(t.overlays.ema21, { title: "EMA 21" }));
    candles.setData(SAMPLE_MARKET.candles.map(lwCandle));
    volume.setData(SAMPLE_MARKET.candles.map((c) => lwVolumeBar(c, t)));
    ema.setData(SAMPLE_MARKET.ema21.map(lwLinePoint));
    const markers = createSeriesMarkers(candles, lwMarkers(t, SAMPLE_MARKET.markers, SAMPLE_MARKET.candles));
    const lines = SAMPLE_MARKET.levels.map((level) => candles.createPriceLine(lwPriceLine(t, level)));
    chart.timeScale().fitContent();
    apisRef.current = { chart, candles, volume, ema, markers, lines };
    return () => {
      apisRef.current = null;
      chart.remove();
    };
  }, []);

  // Theme switch: re-apply options in place (keeps zoom / scroll position).
  useEffect(() => {
    const apis = apisRef.current;
    if (!apis) return;
    apis.chart.applyOptions(lwChartOptions(theme));
    apis.candles.applyOptions(lwCandleOptions(theme));
    apis.ema.applyOptions({ color: theme.overlays.ema21 });
    apis.volume.setData(SAMPLE_MARKET.candles.map((c) => lwVolumeBar(c, theme)));
    apis.markers.setMarkers(lwMarkers(theme, SAMPLE_MARKET.markers, SAMPLE_MARKET.candles));
    apis.lines.forEach((line, i) => line.applyOptions(lwPriceLine(theme, SAMPLE_MARKET.levels[i])));
  }, [theme]);

  return (
    <ChartCard
      title="Price chart (Lightweight Charts)"
      subtitle="Sample · BTC/USDT 5m · lightweight-theme helpers"
      info="Candles, volume, an EMA overlay, AI signal / entry / exit markers and an open position's entry, stop and target lines."
      height={340}
      legend={[
        { key: "ema21", label: "EMA 21", color: theme.overlays.ema21 },
        { key: "entry", label: "Entry", color: theme.accent },
        { key: "sl", label: "Stop", color: theme.down },
        { key: "tp", label: "Target", color: theme.up },
      ]}
    >
      <div ref={containerRef} className="h-full w-full" />
    </ChartCard>
  );
}

import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineData,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { ChevronsRight, CandlestickChart as CandleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { markerColor, useChartTheme, type ChartTheme } from "@/components/charts/chart-theme";
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
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonChart } from "@/components/ui/Skeleton";
import { useCandleStream } from "@/hooks/live";
import { cn } from "@/lib/cn";
import { formatChartTime, formatCompact, formatPct, formatPrice, priceDecimals } from "@/lib/format";
import type { Candle, ChartMarker, IndicatorSeries, PriceLevel, Timeframe, WsCandleData } from "@/types";
import {
  ALL_OVERLAY_LINES,
  legendFromBar,
  liveCandleAction,
  mergeCandle,
  OVERLAY_LINE_LABEL,
  overlayColor,
  overlayOfLine,
  countMarkersInRange,
  markersAt,
  shouldLabelMarkers,
  type LegendReadout,
  type OverlayKey,
  type OverlayLineKey,
} from "./chart-model";

export interface CandlestickChartProps {
  candles: Candle[];
  timeframe: Timeframe;
  /** Indicator series aligned to `candles` (MarketSnapshot.indicators). */
  overlays?: IndicatorSeries;
  /** Overlay groups to draw ('ema9' | 'ema21' | 'ema50' | 'ema200' | 'vwap' | 'bb'). Default none. */
  visibleOverlays?: readonly OverlayKey[];
  /** Trade / signal markers (entries ▲▼, exits ●, stop / target ■). */
  markers?: ChartMarker[];
  /** Horizontal price lines (entry / stop / target of open positions, AI levels). */
  levels?: PriceLevel[];
  /** Volume histogram on its own scale at the bottom (default true). */
  showVolume?: boolean;
  /** Stream live candles for this pair over the WebSocket and update the last bar + overlays. */
  live?: { symbol: string; timeframe: Timeframe };
  /** Plot height in px including the time axis (default 420). */
  height?: number;
  className?: string;
  /** First load: show a skeleton instead of an empty canvas. */
  loading?: boolean;
  /** Bars shown on first render (older history is a scroll away). Default 150; fewer → fit all. */
  initialBars?: number;
  /** Changing this resets the zoom to the latest bars (symbol / dataset changes). */
  viewKey?: string;
}

type LineMap = Record<OverlayLineKey, ISeriesApi<"Line">>;
type LegendState = LegendReadout & { markers?: ChartMarker[] };

interface Apis {
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  lines: LineMap;
  markers: ISeriesMarkersPluginApi<Time>;
  priceLines: IPriceLine[];
}

const LINE_WIDTH: Record<OverlayLineKey, 1 | 2> = {
  ema9: 1,
  ema21: 1,
  ema50: 1,
  ema200: 2,
  vwap: 1,
  bb_upper: 1,
  bb_middle: 1,
  bb_lower: 1,
};

function lineOptions(theme: ChartTheme, line: OverlayLineKey) {
  return {
    ...lwOverlayOptions(overlayColor(theme, line), { width: LINE_WIDTH[line] }),
    lineStyle: line === "bb_middle" || line === "vwap" ? LineStyle.Dashed : LineStyle.Solid,
  };
}

function priceFormatFor(candles: readonly Candle[]) {
  const last = candles[candles.length - 1]?.close ?? 1;
  const precision = priceDecimals(last);
  return { type: "price" as const, precision, minMove: 10 ** -precision };
}

/** Legend readout for the latest drawn bar (no crosshair). */
function latestLegend(apis: Apis | null, bars: readonly Candle[]): LegendReadout | null {
  const last = bars[bars.length - 1];
  if (!apis || !last) return null;
  const values: Partial<Record<OverlayLineKey, number>> = {};
  for (const line of ALL_OVERLAY_LINES) {
    const data = apis.lines[line].data();
    const point = data[data.length - 1] as LineData<Time> | undefined;
    if (point && point.time === last.time && "value" in point) values[line] = point.value;
  }
  return legendFromBar(last, last.volume, values, true);
}

/**
 * The product candlestick chart (TradingView Lightweight Charts v5): candles + volume, EMA / VWAP /
 * Bollinger overlays, trade and signal markers, position price lines, crosshair legend, live
 * updates and a "back to latest" control. Used by Markets, the Overview, and position / trade /
 * backtest detail views.
 *
 *   <CandlestickChart candles={snap.candles} timeframe="5m" overlays={snap.indicators}
 *     visibleOverlays={["ema21", "ema50"]} markers={snap.markers} levels={snap.levels}
 *     live={{ symbol: "BTC/USDT", timeframe: "5m" }} />
 */
export function CandlestickChart({
  candles,
  timeframe,
  overlays,
  visibleOverlays = [],
  markers,
  levels,
  showVolume = true,
  live,
  height = 420,
  className,
  loading,
  initialBars = 150,
  viewKey,
}: CandlestickChartProps) {
  const theme = useChartTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const apisRef = useRef<Apis | null>(null);
  const themeRef = useRef(theme);
  /** Candles currently drawn (REST snapshot + live frames) — volume recolors and the legend. */
  const barsRef = useRef<readonly Candle[]>([]);
  const crosshairActiveRef = useRef(false);
  const lastViewRef = useRef<string | null>(null);
  const [legend, setLegend] = useState<LegendState | null>(null);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  /** Marker text only when it has room (zoomed in / few markers); otherwise it lives in the legend. */
  const [labelMarkers, setLabelMarkers] = useState(true);
  const markersRef = useRef<readonly ChartMarker[]>([]);
  const visibleKey = visibleOverlays.join(",");

  /** Legend for the latest bar (when the crosshair is not over the chart). */
  const refreshLegend = () => setLegend(latestLegend(apisRef.current, barsRef.current));

  // ------------------------------------------------------------ create once per mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const t = themeRef.current;
    const chart = createChart(el, {
      ...lwChartOptions(t),
      // Vertical swipes scroll the page on touch screens; horizontal drags pan the chart.
      handleScroll: { vertTouchDrag: false },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, lwCandleOptions(t));
    const volume = chart.addSeries(HistogramSeries, lwVolumeOptions());
    chart.priceScale("volume").applyOptions(lwVolumeScaleOptions());
    const lines = {} as LineMap;
    for (const line of ALL_OVERLAY_LINES) {
      lines[line] = chart.addSeries(LineSeries, { ...lineOptions(t, line), visible: false });
    }
    const markerApi = createSeriesMarkers(candleSeries, []);
    apisRef.current = { chart, candles: candleSeries, volume, lines, markers: markerApi, priceLines: [] };

    const onCrosshair = (param: MouseEventParams<Time>) => {
      const apis = apisRef.current;
      if (!apis) return;
      const bar = param.time !== undefined ? param.seriesData.get(apis.candles) : undefined;
      if (!param.point || !bar || !("open" in bar)) {
        crosshairActiveRef.current = false;
        refreshLegend();
        return;
      }
      crosshairActiveRef.current = true;
      const vol = param.seriesData.get(apis.volume);
      const values: Partial<Record<OverlayLineKey, number>> = {};
      for (const line of ALL_OVERLAY_LINES) {
        const d = param.seriesData.get(apis.lines[line]);
        if (d && "value" in d) values[line] = d.value;
      }
      const ohlc = bar as CandlestickData<Time>;
      const time = Number(ohlc.time);
      setLegend({
        ...legendFromBar(
          { time, open: ohlc.open, high: ohlc.high, low: ohlc.low, close: ohlc.close },
          vol && "value" in vol ? vol.value : null,
          values,
          false,
        ),
        markers: markersAt(markersRef.current, time),
      });
    };
    chart.subscribeCrosshairMove(onCrosshair);

    const onRange = () => {
      const ts = chart.timeScale();
      setAwayFromLatest(ts.scrollPosition() < -2);
      const range = ts.getVisibleRange();
      const count = range ? countMarkersInRange(markersRef.current, Number(range.from), Number(range.to)) : 0;
      setLabelMarkers(shouldLabelMarkers(ts.options().barSpacing, count));
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      apisRef.current = null;
      chart.remove();
    };
  }, []);

  // ------------------------------------------------------------ data
  const resetKey = `${live?.symbol ?? ""}|${timeframe}|${viewKey ?? ""}`;
  useEffect(() => {
    const apis = apisRef.current;
    if (!apis) return;
    const t = themeRef.current;
    barsRef.current = candles;
    apis.candles.applyOptions({ priceFormat: priceFormatFor(candles) });
    apis.candles.setData(candles.map(lwCandle));
    apis.volume.setData(candles.map((c) => lwVolumeBar(c, t)));
    for (const line of ALL_OVERLAY_LINES) {
      apis.lines[line].setData((overlays?.[line] ?? []).map(lwLinePoint));
    }
    if (candles.length && lastViewRef.current !== resetKey) {
      lastViewRef.current = resetKey;
      const ts = apis.chart.timeScale();
      if (candles.length <= initialBars) ts.fitContent();
      else ts.setVisibleLogicalRange({ from: candles.length - initialBars, to: candles.length + 4 });
    }
    if (!crosshairActiveRef.current) refreshLegend();
  }, [candles, overlays, resetKey, initialBars]);

  // ------------------------------------------------------------ overlays visibility + volume
  useEffect(() => {
    const apis = apisRef.current;
    if (!apis) return;
    const visible = new Set(visibleKey ? visibleKey.split(",") : []);
    for (const line of ALL_OVERLAY_LINES) {
      apis.lines[line].applyOptions({ visible: visible.has(overlayOfLine(line)) });
    }
    apis.volume.applyOptions({ visible: showVolume });
    apis.chart.priceScale("right").applyOptions({
      scaleMargins: showVolume ? { top: 0.08, bottom: 0.2 } : { top: 0.08, bottom: 0.06 },
    });
  }, [visibleKey, showVolume]);

  // ------------------------------------------------------------ markers + price lines
  useEffect(() => {
    const apis = apisRef.current;
    if (!apis) return;
    const list = markers ?? [];
    markersRef.current = list;
    const range = apis.chart.timeScale().getVisibleRange();
    const count = range ? countMarkersInRange(list, Number(range.from), Number(range.to)) : list.length;
    const label = labelMarkers && shouldLabelMarkers(apis.chart.timeScale().options().barSpacing, count);
    const drawn = lwMarkers(theme, list, candles);
    apis.markers.setMarkers(label ? drawn : drawn.map((m) => ({ ...m, text: "" })));
  }, [markers, candles, theme, labelMarkers]);

  useEffect(() => {
    const apis = apisRef.current;
    if (!apis) return;
    for (const line of apis.priceLines) apis.candles.removePriceLine(line);
    apis.priceLines = (levels ?? []).map((level) => apis.candles.createPriceLine(lwPriceLine(theme, level)));
  }, [levels, theme]);

  // ------------------------------------------------------------ theme switch (in place)
  useEffect(() => {
    themeRef.current = theme;
    const apis = apisRef.current;
    if (!apis) return;
    apis.chart.applyOptions(lwChartOptions(theme));
    apis.candles.applyOptions(lwCandleOptions(theme));
    for (const line of ALL_OVERLAY_LINES) {
      apis.lines[line].applyOptions({ color: overlayColor(theme, line) });
    }
    apis.volume.setData(barsRef.current.map((c) => lwVolumeBar(c, theme)));
  }, [theme]);

  // ------------------------------------------------------------ live candles
  const streamEnabled = Boolean(live) && live?.timeframe === timeframe && candles.length > 0;
  useCandleStream(
    live?.symbol,
    live?.timeframe ?? timeframe,
    (frame: WsCandleData) => {
      const apis = apisRef.current;
      if (!apis) return;
      const bars = barsRef.current;
      const lastTime = bars[bars.length - 1]?.time;
      if (liveCandleAction(lastTime, frame.candle.time) === "ignore") return;
      const time = frame.candle.time as UTCTimestamp;
      try {
        apis.candles.update(lwCandle(frame.candle));
        apis.volume.update(lwVolumeBar(frame.candle, themeRef.current));
        for (const line of ALL_OVERLAY_LINES) {
          const value = frame.indicators[line];
          if (typeof value === "number" && Number.isFinite(value)) apis.lines[line].update({ time, value });
        }
      } catch {
        return; // a frame older than the series (race with a refetch) — the next one catches up
      }
      barsRef.current = mergeCandle(bars, frame.candle);
      if (!crosshairActiveRef.current) refreshLegend();
    },
    streamEnabled,
  );

  const empty = !loading && candles.length === 0;

  return (
    <div className={cn("relative min-w-0", className)} style={{ height }}>
      <div
        ref={containerRef}
        className={cn("absolute inset-0", (loading || empty) && "invisible")}
        role="img"
        aria-label={`Candlestick chart, ${timeframe} bars${legend ? `, last close ${formatPrice(legend.close)}` : ""}`}
      />
      {loading ? (
        <SkeletonChart height={height} className="absolute inset-0" />
      ) : empty ? (
        <EmptyState
          size="sm"
          icon={CandleIcon}
          title="No candles yet"
          description="Price history appears as soon as the market feed delivers the first bars."
          className="absolute inset-0"
        />
      ) : null}
      {legend && !loading && !empty ? (
        <ChartLegendReadout legend={legend} timeframe={timeframe} visible={visibleOverlays} theme={theme} />
      ) : null}
      {awayFromLatest && !loading && !empty ? (
        <Button
          size="xs"
          variant="secondary"
          rightIcon={ChevronsRight}
          className="absolute right-16 bottom-9 z-10 shadow-card"
          onClick={() => apisRef.current?.chart.timeScale().scrollToRealTime()}
        >
          Latest
        </Button>
      ) : null}
    </div>
  );
}

function ChartLegendReadout({
  legend,
  timeframe,
  visible,
  theme,
}: {
  legend: LegendState;
  timeframe: Timeframe;
  visible: readonly OverlayKey[];
  theme: ChartTheme;
}) {
  const up = legend.close >= legend.open;
  const tone = up ? "text-up" : "text-down";
  const lines = ALL_OVERLAY_LINES.filter(
    (line) => visible.includes(overlayOfLine(line)) && legend.overlays[line] !== undefined,
  );
  return (
    <div
      className="pointer-events-none absolute top-1.5 left-2 z-10 max-w-[calc(100%-5rem)] rounded-md bg-surface/75 px-2 py-1 text-[11px] leading-[1.55] backdrop-blur-[2px]"
      aria-hidden
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 num text-fg-muted">
        <span className="text-fg-subtle">
          {legend.latest ? "Last" : formatChartTime(legend.time, timeframe === "1d" ? "1d" : "4h")}
        </span>
        <span className="hidden sm:inline">
          O <span className={tone}>{formatPrice(legend.open)}</span>
        </span>
        <span className="hidden sm:inline">
          H <span className={tone}>{formatPrice(legend.high)}</span>
        </span>
        <span className="hidden sm:inline">
          L <span className={tone}>{formatPrice(legend.low)}</span>
        </span>
        <span>
          C <span className={tone}>{formatPrice(legend.close)}</span>
        </span>
        <span className={tone}>
          {up ? "▲" : "▼"} {formatPct(legend.changePct, { signed: true })}
        </span>
        {legend.volume !== null ? (
          <span>
            Vol <span className="text-fg">{formatCompact(legend.volume)}</span>
          </span>
        ) : null}
      </div>
      {lines.length ? (
        <div className="mt-0.5 hidden flex-wrap gap-x-2.5 num text-fg-subtle sm:flex">
          {lines.map((line) => (
            <span key={line} className="inline-flex items-center gap-1">
              <span
                className="h-0.5 w-2.5 rounded-full"
                style={{ backgroundColor: overlayColor(theme, line) }}
              />
              {OVERLAY_LINE_LABEL[line]}
              <span className="text-fg-muted">{formatPrice(legend.overlays[line])}</span>
            </span>
          ))}
        </div>
      ) : null}
      {legend.markers?.length ? (
        <div className="mt-0.5 flex flex-wrap gap-x-2.5 num">
          {legend.markers.map((m, i) => (
            <span key={`${m.kind}-${i}`} className="inline-flex items-center gap-1 text-fg">
              <span aria-hidden style={{ color: markerColor(theme, m.kind) }}>
                {MARKER_GLYPH[m.kind]}
              </span>
              {m.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const MARKER_GLYPH: Record<ChartMarker["kind"], string> = {
  entry_long: "▲",
  entry_short: "▼",
  signal_long: "▲",
  signal_short: "▼",
  exit_win: "●",
  exit_loss: "●",
  take_profit: "■",
  stop_loss: "■",
};

import { CandlestickChart as CandleIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Card } from "@/components/ui/Card";
import { PriceText } from "@/components/ui/PriceText";
import { SkeletonChart } from "@/components/ui/Skeleton";
import { SymbolLabel } from "@/components/ui/SymbolLabel";
import { LiveTag } from "@/components/layout/LiveTag";
import { useStatus, useSymbols } from "@/hooks/queries";
import { useTicker } from "@/hooks/live";
import { useBreakpoint } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { Timeframe } from "@/types";
import { IndicatorToggles, MarkerLegend, TimeframeSelector } from "./ChartControls";
import { ChangeText, FeedBadge } from "./MarketHeader";
import { MarketChart } from "./MarketChart";
import { useChartPrefs } from "./use-chart-prefs";

/**
 * Chart card with its toolbar (timeframe, indicators) — the Markets page's main panel and the
 * Overview widget. Controlled timeframe (URL state on Markets) or internal state (Overview).
 */
export function MarketChartPanel({
  symbol,
  timeframe,
  onTimeframeChange,
  height,
  header,
  top,
  className,
}: {
  symbol: string;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  height?: number;
  /** Left side of the card header (defaults to the symbol with price). */
  header?: ReactNode;
  /** Content above the toolbar (the Markets page's large market header). */
  top?: ReactNode;
  className?: string;
}) {
  const { prefs, toggleOverlay, setPref } = useChartPrefs();
  const wide = useBreakpoint("xl");
  const sm = useBreakpoint("sm");
  const chartHeight = height ?? (wide ? 520 : sm ? 440 : 340);
  return (
    <Card className={cn("flex flex-col", className)}>
      {top ? <div className="border-b border-line px-4 pt-3.5 pb-3">{top}</div> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3 pb-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">{header ?? <SymbolPrice symbol={symbol} />}</div>
        <div className="flex items-center gap-2">
          <TimeframeSelector value={timeframe} onChange={onTimeframeChange} size={sm ? "sm" : "xs"} />
          {wide ? null : <IndicatorToggles prefs={prefs} onToggle={toggleOverlay} onPref={setPref} />}
        </div>
      </div>
      {wide ? (
        <div className="px-4 pb-2">
          <IndicatorToggles prefs={prefs} onToggle={toggleOverlay} onPref={setPref} inline />
        </div>
      ) : null}
      <div className="min-w-0 px-1 sm:px-2">
        <MarketChart
          symbol={symbol}
          timeframe={timeframe}
          prefs={prefs}
          height={chartHeight}
          initialBars={sm ? 150 : 70}
        />
      </div>
      <div className="border-t border-line px-4 py-2">
        <MarkerLegend />
      </div>
    </Card>
  );
}

function SymbolPrice({ symbol }: { symbol: string }) {
  const ticker = useTicker(symbol);
  return (
    <>
      <SymbolLabel symbol={symbol} />
      {ticker ? (
        <>
          <PriceText
            value={ticker.price}
            format={(v) => formatPrice(v, { currency: true })}
            className="text-dense font-semibold text-fg"
          />
          <ChangeText pct={ticker.change_24h_pct} className="text-xs" />
        </>
      ) : null}
      <LiveTag className="ml-0.5" />
    </>
  );
}

/** Overview widget: live chart of one symbol (default the engine's primary) with its own timeframe. */
export function MarketChartCard({ symbol: symbolProp, className }: { symbol?: string; className?: string }) {
  const { primary } = useSymbols();
  const status = useStatus();
  const symbol = symbolProp ?? primary;
  const [tf, setTf] = useState<Timeframe | null>(null);
  const timeframe = tf ?? status.data?.engine?.decision_timeframe ?? "5m";
  const sm = useBreakpoint("sm");
  if (!symbol) {
    return (
      <Card className={cn("flex flex-col", className)}>
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-2 text-[13.5px] font-semibold text-fg">
          <CandleIcon aria-hidden className="size-4 text-fg-muted" /> Market
        </div>
        <MarketChartSkeleton height={sm ? 380 : 300} />
      </Card>
    );
  }
  return (
    <MarketChartPanel
      className={className}
      symbol={symbol}
      timeframe={timeframe}
      onTimeframeChange={setTf}
      height={sm ? 380 : 300}
      header={
        <>
          <Link
            to={`/markets?symbol=${encodeURIComponent(symbol)}&tf=${timeframe}`}
            className="rounded-md hover:opacity-80 focus-visible:outline-2 focus-visible:outline-accent/70"
          >
            <SymbolLabel symbol={symbol} />
          </Link>
          <SymbolTicker symbol={symbol} />
          <span className="hidden xs:inline-flex">
            <FeedBadge />
          </span>
        </>
      }
    />
  );
}

function SymbolTicker({ symbol }: { symbol: string }) {
  const ticker = useTicker(symbol);
  if (!ticker) return null;
  return (
    <>
      <PriceText
        value={ticker.price}
        format={(v) => formatPrice(v, { currency: true })}
        className="text-dense font-semibold text-fg"
      />
      <ChangeText pct={ticker.change_24h_pct} className="hidden text-xs xs:inline" />
    </>
  );
}

function MarketChartSkeleton({ height }: { height: number }) {
  return <SkeletonChart height={height} className="mx-4 mb-4" />;
}

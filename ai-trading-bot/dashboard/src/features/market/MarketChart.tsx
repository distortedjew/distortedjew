import { useMemo } from "react";
import { ErrorState } from "@/components/ui/ErrorState";
import { useAiLatest, useMarket } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/time";
import type { Timeframe } from "@/types";
import { CandlestickChart } from "./CandlestickChart";
import { proposalLevels } from "./chart-model";
import type { ChartPrefs } from "./use-chart-prefs";

/** Candles requested per chart (≈ 1.7 days of 5m bars, 3 weeks of 1h). */
const CHART_LIMIT = 500;

/**
 * Data-connected market chart for one symbol / timeframe: REST snapshot (candles, overlays,
 * markers, open-position levels) + live candles over the WebSocket + optional AI levels.
 */
export function MarketChart({
  symbol,
  timeframe,
  prefs,
  height = 460,
  initialBars,
  className,
}: {
  symbol: string;
  timeframe: Timeframe;
  prefs: ChartPrefs;
  height?: number;
  initialBars?: number;
  className?: string;
}) {
  const q = useMarket(symbol, timeframe, CHART_LIMIT);
  const latest = useAiLatest(symbol);
  const now = useNow();
  const minuteBucket = Math.floor(now / 60_000);
  const snap = q.data && q.data.symbol === symbol && q.data.timeframe === timeframe ? q.data : undefined;

  const aiLevels = useMemo(
    () => (prefs.aiLevels ? proposalLevels(latest.data, symbol, minuteBucket * 60_000) : []),
    [prefs.aiLevels, latest.data, symbol, minuteBucket],
  );
  const levels = useMemo(() => [...(snap?.levels ?? []), ...aiLevels], [snap?.levels, aiLevels]);

  if (q.error && !snap) {
    return (
      <div className={cn("flex items-center justify-center", className)} style={{ height }}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </div>
    );
  }

  return (
    <CandlestickChart
      className={className}
      candles={snap?.candles ?? EMPTY}
      timeframe={timeframe}
      overlays={snap?.indicators}
      visibleOverlays={prefs.overlays}
      markers={snap?.markers}
      levels={levels}
      showVolume={prefs.volume}
      live={{ symbol, timeframe }}
      height={height}
      loading={!snap && (q.isPending || q.isFetching)}
      initialBars={initialBars}
      viewKey={symbol}
    />
  );
}

const EMPTY: never[] = [];

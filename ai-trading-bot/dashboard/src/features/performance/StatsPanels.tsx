import { Skeleton } from "@/components/ui/Skeleton";
import type { PerformanceReport } from "@/types";
import { MetricGrid } from "./parts";
import { performanceMetricItems, tradingStatItems } from "./performance-logic";

function GridSkeleton({ cells, label }: { cells: number; label: string }) {
  return (
    <div className="grid grid-cols-2 gap-px sm:grid-cols-3" aria-busy="true" aria-label={label}>
      {Array.from({ length: cells }, (_, i) => (
        <Skeleton key={i} className="h-[62px] rounded-none" />
      ))}
    </div>
  );
}

/** The nine performance metrics (each with a plain-language ⓘ). */
export function MetricsPanel({
  report,
  loading,
}: {
  report: PerformanceReport | undefined;
  loading?: boolean;
}) {
  if (loading || !report) return <GridSkeleton cells={9} label="Loading performance metrics" />;
  return <MetricGrid items={performanceMetricItems(report)} columns={3} />;
}

/** The eight trading statistics. */
export function TradingStatsPanel({
  report,
  loading,
}: {
  report: PerformanceReport | undefined;
  loading?: boolean;
}) {
  if (loading || !report) return <GridSkeleton cells={8} label="Loading trading statistics" />;
  return <MetricGrid items={tradingStatItems(report)} columns="stats" />;
}

import { RotateCw } from "lucide-react";
import { usePerformance } from "@/hooks/queries";
import { useIsMobile } from "@/hooks/use-media-query";
import { useUrlState } from "@/hooks/use-url-state";
import { PERFORMANCE_RANGES, navItem } from "@/lib/constants";
import type { PerformanceRange } from "@/types";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { RelativeTime } from "@/components/ui/Timestamp";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { toMs } from "@/lib/time";
import { ExitReasonBreakdownCard, SymbolBreakdownCard } from "./BreakdownCards";
import { DailyPnlCard } from "./DailyPnlCard";
import { DistributionCard } from "./DistributionCard";
import { EquityChartCard } from "./EquityChartCard";
import { HeadlineStats } from "./HeadlineStats";
import { MonthlyReturnsCard } from "./MonthlyReturnsCard";
import { MetricsCard, StatSections, TradingStatsCard, WinLossCard } from "./StatSections";

const RANGE_VALUES = PERFORMANCE_RANGES.map((r) => r.value);

/** The whole Performance page: range selector (in the URL), headline stats, charts, tables. */
export function PerformanceView() {
  const nav = navItem("performance");
  const mobile = useIsMobile();
  const [range, setRange] = useUrlState<PerformanceRange>("range", "30d", RANGE_VALUES);
  const q = usePerformance(range);
  const report = q.data;
  const loading = q.isPending;
  const fetching = q.isFetching && !q.isPending;
  const common = {
    report,
    loading,
    fetching,
    error: q.error && report ? undefined : q.error,
    onRetry: () => void q.refetch(),
  };
  const updatedMs = toMs(report?.updated_at);

  const header = (
    <PageHeader
      title={nav.label}
      description={nav.description}
      icon={nav.icon}
      meta={
        updatedMs ? (
          <span className="num text-xs text-fg-subtle">
            Updated <RelativeTime ms={updatedMs} />
          </span>
        ) : null
      }
      actions={
        <SegmentedControl
          aria-label="Time range"
          value={range}
          onValueChange={setRange}
          options={PERFORMANCE_RANGES.map((r) => ({ value: r.value, label: r.label, title: r.description }))}
        />
      }
    />
  );

  if (q.error && !report) {
    return (
      <>
        {header}
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} className="py-12" />
        </Card>
      </>
    );
  }

  return (
    <>
      {header}
      {q.error && report ? (
        <p role="status" className="mb-3 inline-flex items-center gap-1.5 text-xs text-warning">
          <RotateCw className="size-3" aria-hidden /> Couldn&apos;t refresh just now — showing the last loaded
          figures.
        </p>
      ) : null}
      <HeadlineStats report={report} loading={loading} className="mb-4" />

      {mobile ? (
        <div className="space-y-4">
          <EquityChartCard {...common} />
          <StatSections report={report} loading={loading} />
          <DailyPnlCard {...common} />
          <MonthlyReturnsCard report={report} loading={loading} />
          <DistributionCard {...common} />
          <SymbolBreakdownCard {...common} />
          <ExitReasonBreakdownCard {...common} />
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="min-w-0 space-y-4 xl:col-span-2">
              <EquityChartCard {...common} />
              <DailyPnlCard {...common} />
              <MonthlyReturnsCard report={report} loading={loading} />
            </div>
            <div className="grid min-w-0 content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
              <WinLossCard report={report} loading={loading} />
              <MetricsCard report={report} loading={loading} />
              <div className="md:col-span-2 xl:col-span-1">
                <TradingStatsCard report={report} loading={loading} />
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="min-w-0 md:col-span-2 xl:col-span-1">
              <DistributionCard {...common} />
            </div>
            <SymbolBreakdownCard {...common} />
            <ExitReasonBreakdownCard {...common} />
          </div>
        </>
      )}
    </>
  );
}

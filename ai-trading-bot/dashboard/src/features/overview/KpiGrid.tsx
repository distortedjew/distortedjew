import { usePortfolio } from "@/hooks/queries";
import { useIsMobile } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import { formatPct, isNum } from "@/lib/format";
import type { Portfolio } from "@/types";
import { ErrorState } from "@/components/ui/ErrorState";
import { KpiCard } from "@/features/overview/KpiCard";
import { KPI_DEFINITIONS, KPI_ORDER } from "@/features/overview/kpi-definitions";

function suffixFor(key: string, portfolio: Portfolio | undefined): string | undefined {
  if (!portfolio) return undefined;
  if (key === "today_pnl" && isNum(portfolio.today_pnl_pct))
    return formatPct(portfolio.today_pnl_pct, { signed: true });
  if (key === "total_pnl" && isNum(portfolio.total_pnl_pct))
    return formatPct(portfolio.total_pnl_pct, { signed: true });
  return undefined;
}

function nullHintFor(key: string, portfolio: Portfolio | undefined): string | undefined {
  if (key === "profit_factor") {
    const winRate = portfolio?.kpis.win_rate.value;
    return isNum(winRate)
      ? "No losing trades in the last 7 days yet."
      : "No closed trades in the last 7 days yet.";
  }
  if (key === "win_rate") return "No closed trades in the last 7 days yet.";
  return undefined;
}

/**
 * The eight portfolio KPIs from `usePortfolio().data.kpis` (live via WebSocket `portfolio` frames).
 * Desktop 4 × 2 · tablet 2 columns · phones: Equity and Today's P&L full width, the rest 2-up compact.
 */
export function KpiGrid({ className }: { className?: string }) {
  const { data, isPending, error, refetch, isRefetching } = usePortfolio();
  const isMobile = useIsMobile();

  if (error && !data) {
    return (
      <ErrorState
        compact
        error={error}
        onRetry={() => void refetch()}
        retrying={isRefetching}
        className={cn("mb-4", className)}
      />
    );
  }

  const asOf = data ? Date.parse(data.updated_at) : undefined;

  return (
    <div className={cn("grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4", className)}>
      {KPI_ORDER.map((key, index) => {
        const hero = index < 2;
        return (
          <KpiCard
            key={key}
            definition={KPI_DEFINITIONS[key]}
            kpi={data?.kpis[key]}
            loading={isPending}
            valueSuffix={suffixFor(key, data)}
            nullHint={nullHintFor(key, data)}
            asOf={asOf !== undefined && Number.isFinite(asOf) ? asOf : undefined}
            hero={hero && isMobile}
            compact={isMobile && !hero}
            className={cn(hero ? "col-span-2 sm:col-span-1" : "col-span-1")}
          />
        );
      })}
    </div>
  );
}

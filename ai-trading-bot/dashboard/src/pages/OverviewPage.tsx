import { LayoutDashboard } from "lucide-react";
import type { ReactNode } from "react";
import { usePortfolio } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/format";
import { useNow } from "@/lib/time";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiGrid } from "@/features/overview/KpiGrid";

/** "Updated 2s ago" from the portfolio query (refreshed by WebSocket frames). */
function UpdatedAgo() {
  const { dataUpdatedAt } = usePortfolio();
  const now = useNow();
  if (!dataUpdatedAt) return null;
  return <span className="num text-xs text-fg-subtle">Updated {formatRelativeTime(dataUpdatedAt, Math.max(now, dataUpdatedAt))}</span>;
}

/**
 * A clearly labelled slot for a widget that a feature build provides
 * (the Overview is composed from the page features' widgets).
 */
function WidgetSlot({
  title,
  source,
  description,
  height,
  className,
}: {
  title: string;
  source: string;
  description: ReactNode;
  height: number;
  className?: string;
}) {
  return (
    <section
      aria-label={`${title} (placeholder)`}
      className={cn("flex flex-col rounded-xl border border-dashed border-line-strong bg-surface/40 p-4", className)}
      style={{ minHeight: height }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="label-caps">{title}</h2>
        <span className="rounded-md bg-fg/[0.05] px-1.5 py-0.5 font-mono text-[10.5px] text-fg-subtle">{source}</span>
      </div>
      <p className="mt-auto max-w-md text-xs leading-5 text-fg-subtle">{description}</p>
    </section>
  );
}

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        icon={LayoutDashboard}
        description="Portfolio, market and AI state at a glance — everything updates live."
        meta={<UpdatedAgo />}
      />

      <KpiGrid className="mb-4" />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <WidgetSlot
            title="Market chart"
            source="features/market"
            height={420}
            description="Live candlesticks for the primary symbol with EMA / VWAP overlays, AI signals, trade markers and open-position levels."
          />
          <WidgetSlot
            title="Open positions"
            source="features/positions"
            height={220}
            description="Open positions with live P&L, distance to stop and target, and R multiple."
          />
        </div>
        <div className="min-w-0 space-y-4">
          <WidgetSlot
            title="AI analysis"
            source="features/ai"
            height={300}
            description="The latest AI decision: signal, confidence, entry / stop / target, reasons, risks and the risk manager's verdict."
          />
          <WidgetSlot
            title="Multi-timeframe"
            source="features/market"
            height={150}
            description="Trend and signal on 1m · 5m · 15m · 1h · 4h with the alignment score."
          />
          <WidgetSlot
            title="Market regime"
            source="features/market"
            height={130}
            description="Current regime, confidence and how long it has lasted."
          />
          <WidgetSlot
            title="Risk summary"
            source="features/risk"
            height={170}
            description="Daily loss, drawdown, exposure and position-count meters with halt status."
          />
        </div>
      </div>

      <WidgetSlot
        title="Event stream"
        source="features/system"
        height={220}
        className="mt-4"
        description="Live activity feed: market updates, AI analyses, signals, risk checks, executions and system events."
      />
    </>
  );
}

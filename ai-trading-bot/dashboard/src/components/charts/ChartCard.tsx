import { ChartLine, Table2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, type EmptyStateProps } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { IconButton } from "@/components/ui/IconButton";
import { SkeletonChart } from "@/components/ui/Skeleton";
import { ChartLegend, type ChartLegendItem } from "@/components/charts/ChartLegend";

export interface ChartCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  info?: ReactNode;
  icon?: LucideIcon;
  /** Right side of the header (range selector, toggles). */
  actions?: ReactNode;
  /** Height of the plot INCLUDING the x-axis band (px). Default 260. */
  height?: number;
  /** First load (no data yet): skeleton. */
  loading?: boolean;
  /** Refetching with data on screen: the chart is held at reduced opacity (no skeleton flash). */
  fetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Show the empty state instead of the chart. Pass props to customise it. */
  empty?: boolean | EmptyStateProps;
  /** Legend under the header (required when the chart has ≥ 2 series). */
  legend?: ChartLegendItem[];
  /** Accessible table twin: adds a chart/table toggle in the header. */
  table?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Card wrapper for analytics charts with consistent header, legend, loading / refetch / empty /
 * error states and an optional table view. Put a <ResponsiveContainer width="100%" height="100%">
 * (Recharts) inside.
 */
export function ChartCard({
  title,
  subtitle,
  info,
  icon,
  actions,
  height = 260,
  loading,
  fetching,
  error,
  onRetry,
  empty,
  legend,
  table,
  footer,
  className,
  children,
}: ChartCardProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const toggle = table ? (
    <IconButton
      icon={view === "chart" ? Table2 : ChartLine}
      label={view === "chart" ? "Show as table" : "Show as chart"}
      size="xs"
      onClick={() => setView((v) => (v === "chart" ? "table" : "chart"))}
    />
  ) : null;

  let body: ReactNode;
  if (loading) body = <SkeletonChart height={height} />;
  else if (error)
    body =
      height < 160 ? (
        <div className="flex h-full items-center px-2">
          <ErrorState error={error} onRetry={onRetry} compact className="w-full" />
        </div>
      ) : (
        <ErrorState error={error} onRetry={onRetry} className="h-full" />
      );
  else if (empty) {
    const props: EmptyStateProps =
      typeof empty === "object" ? empty : { title: "No data for this period yet" };
    body = <EmptyState size="sm" {...props} className={cn("h-full", props.className)} />;
  } else if (view === "table" && table) body = <div className="h-full overflow-auto">{table}</div>;
  else body = children;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        info={info}
        icon={icon}
        actions={
          actions || toggle ? (
            <>
              {actions}
              {toggle}
            </>
          ) : undefined
        }
      />
      {legend && legend.length > 1 && !loading && !error && !empty ? (
        <ChartLegend items={legend} className="px-4 pb-2" />
      ) : null}
      <div
        className={cn(
          "relative min-w-0 px-2 pb-3 transition-opacity duration-200",
          fetching && !loading && "opacity-60",
        )}
        style={{ height }}
      >
        {body}
      </div>
      {footer ? (
        <div className="border-t border-line px-4 py-2.5 text-xs text-fg-subtle">{footer}</div>
      ) : null}
    </Card>
  );
}

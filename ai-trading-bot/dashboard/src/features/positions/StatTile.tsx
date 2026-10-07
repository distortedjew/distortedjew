import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Skeleton } from "@/components/ui/Skeleton";

/** One headline number: label + ⓘ, a KPI-size value and a quiet sub line (positions and trades strips). */
export function StatTile({
  label,
  info,
  value,
  sub,
  className,
  loading,
}: {
  label: string;
  info: string;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
  loading?: boolean;
}) {
  return (
    <Card className={cn("p-3.5", className)} role="group" aria-label={label}>
      <div className="flex items-center gap-1 text-xs text-fg-subtle">
        {label}
        <InfoTooltip content={info} />
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-2.5 h-7 w-24" />
          <Skeleton className="mt-2 h-3 w-28" />
        </>
      ) : (
        <>
          <div className="mt-1 text-kpi leading-8 font-semibold text-fg">{value}</div>
          <div className="mt-0.5 min-h-4 text-xs text-fg-subtle">{sub}</div>
        </>
      )}
    </Card>
  );
}

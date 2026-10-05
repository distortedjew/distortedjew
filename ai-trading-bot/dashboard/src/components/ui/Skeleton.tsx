import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/** Shimmering placeholder block. Size it with classes: <Skeleton className="h-4 w-24" />. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={cn("skeleton-shimmer rounded-md", className)} style={style} />;
}

const widths = ["w-11/12", "w-4/5", "w-full", "w-3/5", "w-5/6", "w-2/3"];

/** Paragraph placeholder. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/5" : widths[i % widths.length])} />
      ))}
    </div>
  );
}

/** KPI tile placeholder (label, value, delta, sparkline). */
export function SkeletonKpi({ className }: { className?: string }) {
  return (
    <div className={cn("surface-card flex flex-col gap-3 rounded-xl p-4", className)} aria-hidden>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-32" />
      <div className="flex items-end justify-between gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-7 w-20" />
      </div>
    </div>
  );
}

/** Card with header + body placeholder. */
export function SkeletonCard({ className, lines = 4 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("surface-card rounded-xl p-4", className)} aria-hidden>
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-16" />
      </div>
      <SkeletonText lines={lines} />
    </div>
  );
}

/** Chart placeholder: faint gridlines and a shimmering plot. Height includes the axis band. */
export function SkeletonChart({ height = 240, className }: { height?: number; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg", className)} style={{ height }} aria-hidden>
      <div className="absolute inset-0 flex flex-col justify-between py-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-px w-full bg-line-subtle" />
        ))}
      </div>
      <Skeleton className="absolute inset-x-0 bottom-0 h-3/5 rounded-none opacity-60 [mask-image:linear-gradient(to_top,black,transparent)]" />
    </div>
  );
}

/** Table rows placeholder. */
export function SkeletonTable({ rows = 6, columns = 5, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <div className={cn("divide-y divide-line-subtle", className)} aria-hidden>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton
              key={c}
              className={cn("h-3", c === 0 ? "w-24" : c === columns - 1 ? "ml-auto w-16" : "w-full max-w-28 flex-1")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

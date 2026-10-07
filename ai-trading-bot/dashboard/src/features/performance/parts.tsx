import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TONE_TEXT } from "@/lib/tones";
import type { Tone } from "@/types";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Tooltip } from "@/components/ui/Tooltip";
import type { MetricDisplay, MetricItem } from "./performance-logic";

/** A metric value; a missing one renders "—" with the reason as its tooltip (focusable). */
export function MetricValue({ display }: { display: MetricDisplay }) {
  if (display.reason) {
    return (
      <Tooltip content={display.reason}>
        <span
          tabIndex={0}
          aria-label={`Not available. ${display.reason}`}
          className="cursor-help rounded-sm text-fg-subtle focus-visible:outline-2 focus-visible:outline-accent/70"
        >
          —
        </span>
      </Tooltip>
    );
  }
  return <>{display.text}</>;
}

/** One cell of a metric grid: label + ⓘ, big value, optional sub line. */
export function MetricCell({ item, className }: { item: MetricItem; className?: string }) {
  const tone: Tone = item.display.tone;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 bg-surface px-3 py-2.5", className)}>
      <dt className="flex min-w-0 items-center gap-1 text-xs text-fg-subtle">
        <span className="truncate">{item.label}</span>
        <InfoTooltip content={item.info} label={`About ${item.label}`} />
      </dt>
      <dd className="min-w-0">
        <div
          className={cn(
            "truncate text-[17px] leading-6 font-semibold",
            TONE_TEXT[tone === "muted" ? "muted" : tone],
          )}
        >
          <MetricValue display={item.display} />
        </div>
        {item.sub ? <div className="truncate num text-xs text-fg-subtle">{item.sub}</div> : null}
      </dd>
    </div>
  );
}

/** Hairline-divided grid of metric cells (the dense terminal look). */
export function MetricGrid({
  items,
  columns = 3,
  className,
}: {
  items: MetricItem[];
  columns?: 2 | 3 | 4 | "stats";
  className?: string;
}) {
  const cols = {
    2: "grid-cols-2",
    3: "grid-cols-2 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
    stats: "grid-cols-2 sm:grid-cols-4 xl:grid-cols-2",
  }[columns];
  return (
    <dl
      className={cn(
        "grid gap-px overflow-hidden rounded-lg bg-line ring-1 ring-line [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1",
        cols,
        className,
      )}
    >
      {items.map((item) => (
        <MetricCell key={item.key} item={item} />
      ))}
    </dl>
  );
}

export interface TableColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
}

/** Plain accessible table used as the "table view" twin of a chart. */
export function ChartTable<T>({
  rows,
  columns,
  caption,
  rowKey,
}: {
  rows: readonly T[];
  columns: TableColumn<T>[];
  caption: string;
  rowKey: (row: T, index: number) => string;
}) {
  return (
    <table className="w-full border-separate border-spacing-0 text-dense">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.header}
              scope="col"
              className={cn(
                "sticky top-0 border-b border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg-subtle",
                c.align === "right" ? "text-right" : "text-left",
              )}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={rowKey(row, i)} className="hover:bg-fg/[0.03]">
            {columns.map((c) => (
              <td
                key={c.header}
                className={cn(
                  "border-b border-line-subtle px-3 py-1.5 num whitespace-nowrap text-fg",
                  c.align === "right" ? "text-right" : "text-left",
                )}
              >
                {c.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

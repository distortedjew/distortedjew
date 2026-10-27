import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TONE_TEXT } from "@/lib/tones";
import type { Tone } from "@/types";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

export interface KeyValueProps {
  label: ReactNode;
  value: ReactNode;
  /** ⓘ explanation next to the label. */
  info?: ReactNode;
  /** Secondary line under the value. */
  sub?: ReactNode;
  tone?: Tone;
  /** Monospace tabular figures for the value (default true). */
  mono?: boolean;
  /** vertical (label above value, default) or horizontal (label left, value right). */
  orientation?: "vertical" | "horizontal";
  className?: string;
}

/**
 * One labelled value. Vertical for stat blocks, horizontal for detail lists.
 *
 *   <KeyValue label="Entry" value={formatPrice(p.entry_price)} />
 *   <KeyValue orientation="horizontal" label="Fees" value={formatUsd(t.fees)} />
 */
export function KeyValue({
  label,
  value,
  info,
  sub,
  tone,
  mono = true,
  orientation = "vertical",
  className,
}: KeyValueProps) {
  const labelNode = (
    <dt className="flex min-w-0 items-center gap-1 text-xs text-fg-subtle">
      <span className="truncate">{label}</span>
      {info ? <InfoTooltip content={info} /> : null}
    </dt>
  );
  const valueNode = (
    <dd className={cn("min-w-0 text-dense text-fg", mono && "num", tone && TONE_TEXT[tone])}>
      {value}
      {sub ? <div className="mt-0.5 font-sans text-xs text-fg-subtle">{sub}</div> : null}
    </dd>
  );
  if (orientation === "horizontal") {
    return (
      <div className={cn("flex items-baseline justify-between gap-4 py-1.5", className)}>
        {labelNode}
        <div className="text-right">{valueNode}</div>
      </div>
    );
  }
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      {labelNode}
      {valueNode}
    </div>
  );
}

export interface StatItem extends Omit<KeyValueProps, "orientation" | "className"> {
  key?: string;
}

/**
 * Grid of KeyValues (detail panels, drawers). Columns collapse on small screens.
 *
 *   <StatGrid columns={3} items={[{ label: "Size", value: formatSize(p.size, "BTC") }, …]} />
 */
export function StatGrid({
  items,
  columns = 3,
  className,
  divided,
}: {
  items: StatItem[];
  columns?: 2 | 3 | 4 | 6;
  className?: string;
  /** Hairlines between cells (dense terminal look). */
  divided?: boolean;
}) {
  const cols = {
    2: "grid-cols-2",
    3: "grid-cols-2 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
    6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
  }[columns];
  return (
    <dl
      className={cn(
        "grid",
        cols,
        divided
          ? "gap-px overflow-hidden rounded-lg bg-line [&>*]:bg-surface [&>*]:px-3 [&>*]:py-2.5"
          : "gap-x-6 gap-y-4",
        className,
      )}
    >
      {items.map(({ key, ...item }, i) => (
        <KeyValue key={key ?? (typeof item.label === "string" ? item.label : i)} {...item} />
      ))}
    </dl>
  );
}

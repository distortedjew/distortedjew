import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ChartLegendItem {
  key: string;
  label: ReactNode;
  color: string;
  /** line for line series (default), rect for bars / areas, dot for scatter. */
  shape?: "line" | "rect" | "dot";
  /** Optional value after the label (latest value, total). */
  value?: ReactNode;
}

/**
 * HTML legend (always present for ≥ 2 series; none for a single series — the title names it).
 * Pass `onToggle` + `hidden` to let readers isolate series; colors stay with their series.
 */
export function ChartLegend({
  items,
  hidden,
  onToggle,
  className,
}: {
  items: ChartLegendItem[];
  hidden?: ReadonlySet<string>;
  onToggle?: (key: string) => void;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs", className)}>
      {items.map((item) => {
        const off = hidden?.has(item.key) ?? false;
        const swatch = (
          <span
            aria-hidden
            className={cn(
              "shrink-0",
              (item.shape ?? "line") === "line" && "h-0.5 w-3 rounded-full",
              item.shape === "rect" && "size-2.5 rounded-[3px]",
              item.shape === "dot" && "size-2 rounded-full",
            )}
            style={{ backgroundColor: item.color }}
          />
        );
        const content = (
          <>
            {swatch}
            <span className="text-fg-muted">{item.label}</span>
            {item.value !== undefined ? <span className="num text-fg">{item.value}</span> : null}
          </>
        );
        return (
          <li key={item.key} className={cn("transition-opacity", off && "opacity-40")}>
            {onToggle ? (
              <button
                type="button"
                aria-pressed={!off}
                onClick={() => onToggle(item.key)}
                className="-mx-1 inline-flex items-center gap-1.5 rounded px-1 hover:bg-fg/[0.05]"
              >
                {content}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5">{content}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

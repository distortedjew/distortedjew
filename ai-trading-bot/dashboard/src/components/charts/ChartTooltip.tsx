import type { ReactNode } from "react";
import type { TooltipContentProps } from "recharts";
import { cn } from "@/lib/cn";

type Item = NonNullable<TooltipContentProps<number | string, string>["payload"]>[number];

export interface ChartTooltipContentProps extends Partial<Pick<TooltipContentProps<number | string, string>, "active" | "payload" | "label">> {
  /** Format each value (the number leads; the series name follows). */
  valueFormatter?: (value: number, name: string, item: Item) => ReactNode;
  /** Format the header (x value: a date, a bucket label…). */
  labelFormatter?: (label: string | number | undefined, payload: readonly Item[]) => ReactNode;
  hideLabel?: boolean;
  /** Series key shape: short line (lines/areas, default), square (bars), dot (scatter). */
  indicator?: "line" | "square" | "dot";
  /** Extra rows under the values. */
  footer?: (payload: readonly Item[]) => ReactNode;
  className?: string;
}

/**
 * Themed Recharts tooltip: one readout listing every series at the hovered x.
 *
 *   <Tooltip cursor={lineCursor(theme)} content={<ChartTooltipContent valueFormatter={(v) => formatUsd(v)}
 *     labelFormatter={(t) => formatDateTime(Number(t) * 1000)} />} />
 */
export function ChartTooltipContent({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
  hideLabel,
  indicator = "line",
  footer,
  className,
}: ChartTooltipContentProps) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((item) => !item.hide && item.value !== undefined && item.value !== null);
  if (!items.length) return null;
  return (
    <div className={cn("surface-elevated min-w-32 rounded-lg px-2.5 py-2 text-xs", className)}>
      {!hideLabel ? (
        <div className="mb-1.5 text-[11px] whitespace-nowrap text-fg-subtle">
          {labelFormatter ? labelFormatter(label, payload) : label}
        </div>
      ) : null}
      <div className="grid grid-cols-[auto_auto_1fr] items-center gap-x-2 gap-y-1">
        {items.map((item, i) => {
          const color = (item.color ?? item.stroke ?? item.fill ?? "currentColor") as string;
          const name = String(item.name ?? item.dataKey ?? "");
          const numeric = typeof item.value === "number" ? item.value : Number(item.value);
          return (
            <div key={`${name}-${i}`} className="contents">
              <span
                aria-hidden
                className={cn(
                  "shrink-0",
                  indicator === "line" && "h-0.5 w-2.5 rounded-full",
                  indicator === "square" && "size-2 rounded-[2px]",
                  indicator === "dot" && "size-2 rounded-full",
                )}
                style={{ backgroundColor: color }}
              />
              <span className="num font-medium whitespace-nowrap text-fg">
                {valueFormatter && Number.isFinite(numeric) ? valueFormatter(numeric, name, item) : String(item.value)}
              </span>
              <span className="truncate text-fg-subtle">{name}</span>
            </div>
          );
        })}
      </div>
      {footer ? <div className="mt-1.5 border-t border-line pt-1.5 text-fg-muted">{footer(items)}</div> : null}
    </div>
  );
}

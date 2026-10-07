import { cn } from "@/lib/cn";
import { formatPct, formatPrice } from "@/lib/format";
import { Tooltip } from "@/components/ui/Tooltip";
import type { Position } from "@/types";
import { sltpGeometry } from "./position-math";

type Levels = Pick<Position, "entry_price" | "stop_loss" | "take_profit" | "current_price">;

/**
 * Where price sits between the stop (left) and the target (right). The red half is the risk
 * side of the entry, the green half the reward side; the filled stretch runs from the entry to
 * the current price and the dot is the price now. Direction is also stated in the tooltip and the
 * accessible name, so color is never the only cue.
 */
export function SltpProgress({
  position,
  className,
  labels,
}: {
  position: Levels;
  className?: string;
  /** Show the stop and target prices under the ends of the bar (drawer). */
  labels?: boolean;
}) {
  const geometry = sltpGeometry(
    position.entry_price,
    position.stop_loss,
    position.take_profit,
    position.current_price,
  );
  if (!geometry) return <span className={cn("num text-fg-subtle", className)}>—</span>;

  const { currentPct, entryPct, beyond } = geometry;
  const towardTarget = currentPct >= entryPct;
  const from = Math.min(entryPct, currentPct);
  const to = Math.max(entryPct, currentPct);
  const progressToTarget = ((currentPct - entryPct) / Math.max(1e-9, 100 - entryPct)) * 100;
  const progressToStop = ((entryPct - currentPct) / Math.max(1e-9, entryPct)) * 100;
  const summary = beyond
    ? `Price is beyond the ${beyond === "stop" ? "stop loss" : "take profit"}`
    : towardTarget
      ? `${formatPct(Math.max(0, progressToTarget), { decimals: 0 })} of the way from entry to take profit`
      : `${formatPct(Math.max(0, progressToStop), { decimals: 0 })} of the way from entry to stop loss`;

  const bar = (
    <div
      role="img"
      aria-label={`${summary}. Stop ${formatPrice(position.stop_loss)}, entry ${formatPrice(position.entry_price)}, target ${formatPrice(position.take_profit)}`}
      className={cn("relative h-1.5 w-full rounded-full", labels && "h-2")}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-l-full bg-down/15"
        style={{ width: `${entryPct}%` }}
      />
      <span
        aria-hidden
        className="absolute inset-y-0 right-0 rounded-r-full bg-up/15"
        style={{ width: `${100 - entryPct}%` }}
      />
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 transition-[left,width] duration-500 ease-out",
          towardTarget ? "bg-up" : "bg-down",
        )}
        style={{ left: `${from}%`, width: `${to - from}%` }}
      />
      <span aria-hidden className="absolute -inset-y-0.5 w-px bg-fg/45" style={{ left: `${entryPct}%` }} />
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface transition-[left] duration-500 ease-out",
          towardTarget ? "bg-up" : "bg-down",
        )}
        style={{ left: `${currentPct}%` }}
      />
    </div>
  );

  return (
    <Tooltip
      content={
        <span className="block num text-[11px] leading-4">
          <span className="block">{summary}</span>
          <span className="block text-down">SL {formatPrice(position.stop_loss)}</span>
          <span className="block text-fg-muted">Entry {formatPrice(position.entry_price)}</span>
          <span className="block text-up">TP {formatPrice(position.take_profit)}</span>
        </span>
      }
    >
      <div className={cn("min-w-0", className)}>
        {bar}
        {labels ? (
          <div className="mt-1.5 flex justify-between num text-[11px] text-fg-subtle">
            <span>
              <span className="text-down">SL</span> {formatPrice(position.stop_loss)}
            </span>
            <span>
              <span className="text-up">TP</span> {formatPrice(position.take_profit)}
            </span>
          </div>
        ) : null}
      </div>
    </Tooltip>
  );
}

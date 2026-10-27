import { FlaskConical, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { TRADING_MODE_META } from "@/lib/constants";
import type { TradingMode } from "@/types";
import { Tooltip } from "@/components/ui/Tooltip";

/**
 * The trading mode, impossible to miss: amber "PAPER TRADING" or a solid red "LIVE TRADING"
 * with a pulsing dot. `compact` shortens the label on phones ("PAPER" / "LIVE") but never hides it.
 */
export function TradingModeBadge({
  mode,
  compact,
  className,
}: {
  mode: TradingMode | undefined;
  compact?: boolean;
  className?: string;
}) {
  if (!mode) {
    return (
      <span
        className={cn(
          "inline-flex h-7 items-center rounded-full px-3 text-[11px] font-semibold tracking-[0.08em] text-fg-subtle ring-1 ring-line ring-inset",
          className,
        )}
      >
        MODE…
      </span>
    );
  }
  const meta = TRADING_MODE_META[mode];
  if (mode === "live") {
    return (
      <Tooltip content={meta.description}>
        <span
          tabIndex={0}
          role="status"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full bg-down-solid px-3 text-[11px] font-bold tracking-[0.08em] whitespace-nowrap text-white",
            "shadow-[0_0_0_3px_color-mix(in_oklab,var(--down)_25%,transparent),0_0_18px_-2px_var(--down)]",
            className,
          )}
        >
          <span className="relative inline-flex size-2" aria-hidden>
            <span className="absolute inset-0 animate-pulse-ring rounded-full bg-white" />
            <span className="relative size-2 rounded-full bg-white" />
          </span>
          <OctagonAlert className="size-3.5 max-sm:hidden" aria-hidden />
          {compact ? "LIVE" : "LIVE TRADING"}
          <span className="sr-only"> — real funds at risk</span>
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={meta.description}>
      <span
        tabIndex={0}
        role="status"
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full bg-warning/12 px-2.5 text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-warning ring-1 ring-warning/35 ring-inset",
          className,
        )}
      >
        <FlaskConical className="size-3.5" aria-hidden strokeWidth={2.25} />
        {compact ? "PAPER" : "PAPER TRADING"}
      </span>
    </Tooltip>
  );
}

import { cn } from "@/lib/cn";
import { formatPct, isNum } from "@/lib/format";

export interface ConfidenceMeterProps {
  /** AI confidence in percent units (0–100). */
  value: number | null | undefined;
  /**
   * The engine's minimum confidence to trade (settings `risk.min_ai_confidence`, also
   * `RiskSnapshot.min_confidence`). Drawn as a tick; values below it are dimmed.
   */
  threshold?: number;
  /** inline (default): "82%" + a short bar · bar: full-width bar with the value above · text: value only. */
  variant?: "inline" | "bar" | "text";
  className?: string;
}

/**
 * AI confidence, rendered identically on every page: violet (the AI accent) percent with a slim
 * meter. Below the trading threshold it fades, so "would not trade" reads at a glance.
 *
 *   <ConfidenceMeter value={analysis.confidence} threshold={risk.min_confidence} />
 *   <ConfidenceMeter value={trade.ai_confidence} variant="text" />          // dense table cell
 */
export function ConfidenceMeter({ value, threshold, variant = "inline", className }: ConfidenceMeterProps) {
  if (!isNum(value)) return <span className={cn("num text-fg-subtle", className)}>—</span>;
  const pct = Math.max(0, Math.min(100, value));
  const below = isNum(threshold) && value < threshold;
  const label = formatPct(value, { decimals: 0 });
  const title = isNum(threshold)
    ? `AI confidence ${label} (trades at ≥ ${formatPct(threshold, { decimals: 0 })})`
    : `AI confidence ${label}`;

  if (variant === "text") {
    return (
      <span title={title} className={cn("num", below ? "text-fg-subtle" : "text-ai", className)}>
        {label}
      </span>
    );
  }

  const meter = (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={title}
      className={cn("relative block h-1 overflow-hidden rounded-full bg-ai/15", variant === "inline" ? "w-10" : "w-full")}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]",
          below ? "bg-fg-subtle/60" : "bg-ai",
        )}
        style={{ width: `${pct}%` }}
      />
      {isNum(threshold) ? (
        <span
          aria-hidden
          className="absolute inset-y-0 w-px bg-fg/70"
          style={{ left: `${Math.max(0, Math.min(100, threshold))}%` }}
        />
      ) : null}
    </span>
  );

  if (variant === "bar") {
    return (
      <span className={cn("flex w-full flex-col gap-1.5", className)} title={title}>
        <span className={cn("num text-dense font-medium", below ? "text-fg-muted" : "text-ai")}>{label}</span>
        {meter}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={title}>
      <span className={cn("num min-w-[3ch] text-right", below ? "text-fg-subtle" : "text-ai")}>{label}</span>
      {meter}
    </span>
  );
}

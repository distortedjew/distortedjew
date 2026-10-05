import { cn } from "@/lib/cn";
import { formatInt, formatNumber, formatPct, formatPnl, isNum, signOf } from "@/lib/format";
import { TONE_SOFT, TONE_TEXT } from "@/lib/tones";
import type { Tone } from "@/types";

export type DeltaFormat = "currency" | "percent" | "pp" | "number" | "count" | "ratio";

export interface DeltaBadgeProps {
  /** Absolute change (in the metric's own unit). */
  change: number | null | undefined;
  /** Relative change in percent units (4.82 = +4.82 %). */
  changePct?: number | null;
  /** How to print `change`: currency "+$482.31", percent "+4.82%", pp "+4.8 pp", number, count, ratio. */
  format?: DeltaFormat;
  /** Lower is better (e.g. losses, latency): flips the tone, not the arrow. */
  invert?: boolean;
  /** Force a tone (otherwise derived from the sign). */
  tone?: Tone;
  /** text (default, for KPI cards) or pill (tinted background, for tables). */
  variant?: "text" | "pill";
  /** Hide the absolute change and show only the percent. */
  pctOnly?: boolean;
  size?: "sm" | "md";
  className?: string;
}

function formatChange(change: number, format: DeltaFormat): string {
  switch (format) {
    case "currency":
      return formatPnl(change);
    case "percent":
      return formatPct(change, { signed: true });
    case "pp":
      return `${formatNumber(change, Math.abs(change) >= 10 ? 1 : 2, { signed: true })} pp`;
    case "count":
      return formatInt(change, { signed: true });
    case "ratio":
      return formatNumber(change, 2, { signed: true });
    default:
      return formatNumber(change, 2, { signed: true });
  }
}

/**
 * ▲ / ▼ change indicator: "▲ +$482.31 +4.82%". The arrow shows direction, the tone shows
 * good/bad (use `invert` when lower is better), so meaning never relies on color alone.
 */
export function DeltaBadge({
  change,
  changePct,
  format = "number",
  invert,
  tone,
  variant = "text",
  pctOnly,
  size = "sm",
  className,
}: DeltaBadgeProps) {
  const basis = isNum(change) ? change : changePct;
  if (!isNum(basis)) {
    return <span className={cn("num text-xs text-fg-subtle", className)}>—</span>;
  }
  const direction = signOf(basis, 4);
  const resolvedTone: Tone =
    tone ?? (direction === 0 ? "neutral" : direction > 0 !== Boolean(invert) ? "up" : "down");
  const arrow = direction > 0 ? "▲" : direction < 0 ? "▼" : "■";

  const parts: string[] = [];
  if (!pctOnly && isNum(change)) parts.push(formatChange(change, format));
  if (isNum(changePct) && format !== "percent") parts.push(formatPct(changePct, { signed: true }));
  if (parts.length === 0 && isNum(changePct)) parts.push(formatPct(changePct, { signed: true }));

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 num font-medium whitespace-nowrap",
        size === "sm" ? "text-xs" : "text-dense",
        variant === "pill"
          ? cn("rounded-md px-1.5 py-0.5 ring-1 ring-inset", TONE_SOFT[resolvedTone])
          : TONE_TEXT[resolvedTone],
        resolvedTone === "neutral" && variant === "text" && "text-fg-muted",
        className,
      )}
    >
      <span aria-hidden className={cn("text-[0.7em] leading-none", direction === 0 && "opacity-50")}>
        {arrow}
      </span>
      <span className="sr-only">{direction > 0 ? "up" : direction < 0 ? "down" : "unchanged"}</span>
      {parts.map((part, i) => (
        <span key={i} className={i > 0 ? "opacity-80" : undefined}>
          {part}
        </span>
      ))}
    </span>
  );
}

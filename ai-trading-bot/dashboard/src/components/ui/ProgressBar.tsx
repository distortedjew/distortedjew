import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { RiskMeterStatus, Tone } from "@/types";

export interface ProgressBarProps {
  /** Current value (same unit as max). */
  value: number | null | undefined;
  max?: number;
  /** Explicit tone; otherwise derived from `status` or `thresholds`. */
  tone?: Tone;
  /** Risk meter status from the API (ok / warning / critical / breached). */
  status?: RiskMeterStatus;
  /** Utilization thresholds in percent of max: warning ≥ 70, critical ≥ 90 by default. */
  thresholds?: { warning: number; critical: number };
  size?: "xs" | "sm" | "md";
  /** Optional marker at this percent of max (e.g. a soft limit). */
  markerPct?: number;
  label?: ReactNode;
  /** Right side of the label row (e.g. "$120 / $200"). */
  valueLabel?: ReactNode;
  className?: string;
  "aria-label"?: string;
}

const STATUS_TONE: Record<RiskMeterStatus, Tone> = { ok: "accent", warning: "warning", critical: "down", breached: "down" };

const FILL: Partial<Record<Tone, string>> = {
  accent: "bg-accent",
  up: "bg-up",
  down: "bg-down",
  warning: "bg-warning",
  info: "bg-info",
  ai: "bg-ai",
  neutral: "bg-fg-muted",
  muted: "bg-fg-disabled",
};
/** Track = a lighter step of the same hue, so the state reads across the whole bar. */
const TRACK: Partial<Record<Tone, string>> = {
  accent: "bg-accent/15",
  up: "bg-up/15",
  down: "bg-down/15",
  warning: "bg-warning/15",
  info: "bg-info/15",
  ai: "bg-ai/15",
  neutral: "bg-fg/10",
  muted: "bg-fg/8",
};

/**
 * Horizontal meter (risk utilization, backtest progress, confidence). The fill carries severity:
 * accent → warning → down. Values are clamped to 0–100 % of max.
 *
 *   <ProgressBar value={meter.utilization_pct} status={meter.status} label={meter.label} valueLabel="$120 / $200" />
 */
export function ProgressBar({
  value,
  max = 100,
  tone,
  status,
  thresholds = { warning: 70, critical: 90 },
  size = "sm",
  markerPct,
  label,
  valueLabel,
  className,
  ...aria
}: ProgressBarProps) {
  const pct = value === null || value === undefined || !Number.isFinite(value) || max <= 0 ? 0 : (value / max) * 100;
  const clamped = Math.max(0, Math.min(100, pct));
  const resolved: Tone =
    tone ??
    (status
      ? STATUS_TONE[status]
      : pct >= thresholds.critical
        ? "down"
        : pct >= thresholds.warning
          ? "warning"
          : "accent");
  const height = size === "xs" ? "h-1" : size === "sm" ? "h-1.5" : "h-2.5";

  return (
    <div className={cn("w-full", className)}>
      {label || valueLabel ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
          <span className="truncate text-fg-muted">{label}</span>
          {valueLabel ? <span className="num shrink-0 text-fg">{valueLabel}</span> : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-label={aria["aria-label"] ?? (typeof label === "string" ? label : undefined)}
        className={cn("relative w-full overflow-hidden rounded-full", height, TRACK[resolved])}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width,background-color] duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]",
            FILL[resolved],
            status === "breached" && "animate-pulse",
          )}
          style={{ width: `${clamped}%` }}
        />
        {markerPct !== undefined ? (
          <span
            aria-hidden
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-fg/60"
            style={{ left: `${Math.max(0, Math.min(100, markerPct))}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { isNum, toneOf } from "@/lib/format";
import { TONE_TEXT } from "@/lib/tones";
import type { Kpi } from "@/types";
import { Sparkline } from "@/components/charts/Sparkline";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { DeltaBadge } from "@/components/ui/DeltaBadge";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatKpiValue, type KpiDefinition } from "@/features/overview/kpi-definitions";

export interface KpiCardProps {
  definition: KpiDefinition;
  kpi: Kpi | undefined;
  /** First load: skeleton. */
  loading?: boolean;
  /** Extra text after the value, e.g. P&L as a percent of equity. */
  valueSuffix?: ReactNode;
  /** Shown as the value's tooltip when the API returns null (e.g. "No losing trades yet"). */
  nullHint?: string;
  /** Larger presentation (phones: Equity and Today's P&L lead full width). */
  hero?: boolean;
  /** Compact presentation for the 2-column phone grid. */
  compact?: boolean;
  className?: string;
}

/**
 * One KPI tile: label + ⓘ, animated value, ▲/▼ change vs the previous period, and a
 * sparkline. The card outline flashes softly when the value updates.
 */
export function KpiCard({ definition, kpi, loading, valueSuffix, nullHint, hero, compact, className }: KpiCardProps) {
  const value = kpi?.value ?? null;

  // Flash the card when the value changes (derived during render; no effect needed).
  const [previous, setPrevious] = useState(value);
  const [flashes, setFlashes] = useState(0);
  if (value !== previous) {
    setPrevious(value);
    if (isNum(value) && isNum(previous)) setFlashes((n) => n + 1);
  }

  const tone = definition.signedValue ? toneOf(value) : "neutral";
  const format = (n: number) => formatKpiValue(definition.format, n);

  const info = (
    <span className="block space-y-1">
      <span className="block">{definition.description}</span>
      <span className="block text-fg-subtle">{definition.sparkWindow}</span>
    </span>
  );

  if (loading && !kpi) {
    return (
      <div
        aria-busy="true"
        aria-label={`${definition.label} loading`}
        className={cn("surface-card flex flex-col gap-3 rounded-xl p-4", compact && "gap-2 p-3", className)}
      >
        <Skeleton className="h-3 w-24" />
        <Skeleton className={cn("h-7 w-32", compact && "h-5 w-20")} />
        <div className="flex items-end justify-between gap-3">
          <Skeleton className="h-3 w-24" />
          {!compact ? <Skeleton className="h-7 w-24" /> : null}
        </div>
      </div>
    );
  }

  const valueNode = (
    <span
      className={cn(
        "num-sans font-semibold tracking-[-0.02em] whitespace-nowrap",
        compact ? "text-lg leading-6" : hero ? "text-[28px] leading-9" : "text-kpi",
        TONE_TEXT[tone],
        tone === "neutral" && "text-fg",
      )}
    >
      <AnimatedNumber value={value} format={format} />
    </span>
  );

  return (
    <section
      aria-label={definition.label}
      className={cn(
        "surface-card group/kpi relative flex min-w-0 flex-col rounded-xl transition-colors duration-200 hover:border-line-strong",
        compact ? "gap-1.5 p-3" : "gap-2 p-4",
        className,
      )}
    >
      {flashes > 0 ? (
        // Re-keyed on every update so the soft ring animation restarts; the card itself never remounts.
        <span key={flashes} aria-hidden className="pointer-events-none absolute -inset-px animate-flash-ring rounded-xl" />
      ) : null}
      <header className="flex items-center gap-1.5">
        <h3 className="label-caps truncate">{definition.label}</h3>
        <InfoTooltip content={info} label={`About ${definition.label}`} />
      </header>

      <div className={cn("flex min-w-0 items-end justify-between gap-3", compact && "flex-col items-stretch gap-1.5")}>
        <div className="min-w-0 space-y-1.5">
          <div className="flex min-w-0 items-baseline gap-2">
            {value === null && nullHint ? (
              <Tooltip content={nullHint}>
                <span tabIndex={0} className="rounded-sm">
                  {valueNode}
                </span>
              </Tooltip>
            ) : (
              valueNode
            )}
            {valueSuffix ? <span className={cn("num text-xs whitespace-nowrap", TONE_TEXT[tone])}>{valueSuffix}</span> : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <DeltaBadge
              change={kpi?.change}
              changePct={definition.showChangePct ? kpi?.change_pct : undefined}
              format={definition.deltaFormat}
              invert={definition.invertDelta}
            />
            {kpi?.comparison_label ? (
              <span className="truncate text-[11px] text-fg-subtle">{kpi.comparison_label}</span>
            ) : null}
          </div>
        </div>
        <div className={cn("shrink-0", compact ? "w-full" : hero ? "w-[42%] max-w-44" : "w-[38%] max-w-36")}>
          <Sparkline
            data={kpi?.sparkline ?? []}
            height={compact ? 24 : 36}
            variant={definition.sparkVariant}
            tone={definition.sparkTone}
            formatValue={format}
            aria-label={`${definition.label}: ${definition.sparkWindow}`}
          />
        </div>
      </div>
    </section>
  );
}

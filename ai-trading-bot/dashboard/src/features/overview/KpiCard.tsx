import { useEffect, useRef, type ReactNode } from "react";
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
import { formatKpiValue, sparkLabels, type KpiDefinition } from "@/features/overview/kpi-definitions";

export interface KpiCardProps {
  definition: KpiDefinition;
  kpi: Kpi | undefined;
  /** First load: skeleton. */
  loading?: boolean;
  /** Extra text after the value, e.g. P&L as a percent of equity. */
  valueSuffix?: ReactNode;
  /** Shown as the value's tooltip when the API returns null (e.g. "No losing trades yet"). */
  nullHint?: string;
  /** When the sparkline's last point was measured (ms epoch) — anchors the hover labels. */
  asOf?: number;
  /** Larger presentation (phones: Equity and Today's P&L lead full width). */
  hero?: boolean;
  /** Compact presentation for the 2-column phone grid. */
  compact?: boolean;
  className?: string;
}

/** Live KPIs tick about once a second; the outline flash is reserved for changes worth noticing. */
const FLASH_MIN_INTERVAL_MS = 6_000;

/**
 * Soft outline flash when the displayed value changes — at most once per FLASH_MIN_INTERVAL_MS
 * so a value that ticks every second (equity, P&L) never strobes. Imperative: no re-render.
 */
function useUpdateFlash(display: string | null) {
  const ringRef = useRef<HTMLSpanElement>(null);
  const previous = useRef(display);
  const lastFlash = useRef(0);
  useEffect(() => {
    const before = previous.current;
    previous.current = display;
    if (before === null || display === null || before === display) return;
    const now = performance.now();
    if (now - lastFlash.current < FLASH_MIN_INTERVAL_MS) return;
    lastFlash.current = now;
    const ring = ringRef.current;
    if (!ring) return;
    ring.classList.remove("animate-flash-ring");
    void ring.offsetWidth; // restart the CSS animation
    ring.classList.add("animate-flash-ring");
  }, [display]);
  return ringRef;
}

/**
 * One KPI tile (dataviz stat-tile contract): label + ⓘ, animated value, ▲/▼ change vs the named
 * previous period (colored by direction × whether up is good), and a quiet sparkline with the
 * current period in the accent. The outline flashes softly (rate-limited) when the value changes.
 */
export function KpiCard({
  definition,
  kpi,
  loading,
  valueSuffix,
  nullHint,
  asOf,
  hero,
  compact,
  className,
}: KpiCardProps) {
  const value = kpi?.value ?? null;
  const format = (n: number) => formatKpiValue(definition.format, n);
  const ringRef = useUpdateFlash(isNum(value) ? format(value) : null);
  const tone = definition.signedValue ? toneOf(value) : "neutral";
  const sparkline = kpi?.sparkline ?? [];

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
        className={cn("flex flex-col gap-3 rounded-xl surface-card p-4", compact && "gap-2 p-3", className)}
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

  // Proportional figures on stat-tile values (tabular figures are for aligned columns).
  const valueNode = (
    <span
      className={cn(
        "font-sans font-semibold tracking-[-0.02em] whitespace-nowrap",
        compact ? "text-lg leading-6" : hero ? "text-[28px] leading-9" : "text-kpi",
        TONE_TEXT[tone],
        tone === "neutral" && "text-fg",
      )}
    >
      <AnimatedNumber value={value} format={format} />
    </span>
  );

  const valueRow = (
    <div className={cn("flex min-w-0 items-baseline gap-x-2", compact && "flex-wrap gap-y-0.5")}>
      {value === null && nullHint ? (
        <Tooltip content={nullHint}>
          <span tabIndex={0} className="rounded-sm">
            {valueNode}
          </span>
        </Tooltip>
      ) : (
        valueNode
      )}
      {valueSuffix ? (
        <span className={cn("num text-xs whitespace-nowrap", TONE_TEXT[tone])}>{valueSuffix}</span>
      ) : null}
    </div>
  );

  const deltaRow = (
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
  );

  const sparklineNode = (
    <Sparkline
      data={sparkline}
      height={compact ? 26 : 38}
      variant={definition.sparkVariant}
      tone="deemphasis"
      highlightLast
      formatValue={format}
      labels={asOf !== undefined ? sparkLabels(definition, sparkline.length, asOf) : undefined}
      aria-label={`${definition.label}: ${definition.sparkWindow}`}
    />
  );

  return (
    <section
      aria-label={definition.label}
      className={cn(
        "group/kpi relative flex min-w-0 flex-col rounded-xl surface-card transition-colors duration-200 hover:border-line-strong",
        compact ? "gap-1.5 p-3" : "gap-2 p-4",
        className,
      )}
    >
      <span ref={ringRef} aria-hidden className="pointer-events-none absolute -inset-px rounded-xl" />
      <header className="flex items-center gap-1.5">
        <h3 className="truncate label-caps">{definition.label}</h3>
        <InfoTooltip content={info} label={`About ${definition.label}`} />
      </header>

      {compact ? (
        <>
          {valueRow}
          {deltaRow}
          <div className="mt-auto pt-0.5">{sparklineNode}</div>
        </>
      ) : (
        <>
          <div className="flex min-w-0 items-end justify-between gap-3">
            <div className="min-w-0">{valueRow}</div>
            <div className={cn("shrink-0", hero ? "w-[44%] max-w-52" : "w-[40%] max-w-48")}>
              {sparklineNode}
            </div>
          </div>
          {deltaRow}
        </>
      )}
    </section>
  );
}

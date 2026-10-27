/**
 * Building blocks shared by the position and trade drawers: a titled section, the risk-check list,
 * and thin wrappers around the chart and AI reasoning renderers owned by the Markets / AI pages.
 */
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { AnalysisDetails } from "@/features/ai";
import { CandlestickChart } from "@/features/market";
import { cn } from "@/lib/cn";
import { SectionHeader } from "@/components/ui/PageHeader";
import { EnumBadge } from "@/components/ui/EnumBadge";
import type { AIAnalysis, Candle, ChartMarker, PriceLevel, RiskCheck, Timeframe } from "@/types";

export function DrawerSection({
  title,
  info,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  info?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("py-4 first:pt-0", className)}>
      <SectionHeader title={title} info={info} actions={actions} />
      {children}
    </section>
  );
}

/** Every risk check the manager evaluated, passed or not, with the value against its limit. */
export function RiskChecks({ analysis }: { analysis: AIAnalysis | null | undefined }) {
  const decision = analysis?.risk;
  if (!decision) {
    return (
      <p className="rounded-lg border border-line-subtle bg-surface-2/50 px-3 py-2.5 text-dense text-fg-subtle">
        The risk checks are not available because this position is not linked to a stored AI decision.
      </p>
    );
  }
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs text-fg-subtle">
        <EnumBadge kind="riskStatus" value={decision.status} size="xs" />
        <span>
          {decision.checks.filter((c) => c.passed).length} of {decision.checks.length} checks passed
        </span>
      </div>
      <ul className="divide-y divide-line-subtle rounded-lg border border-line-subtle">
        {decision.checks.map((check) => (
          <RiskCheckRow key={check.name} check={check} />
        ))}
      </ul>
      {decision.reasons.length ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-fg-muted">
          {decision.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RiskCheckRow({ check }: { check: RiskCheck }) {
  const Icon = check.passed ? Check : X;
  return (
    <li className="flex items-start gap-2.5 px-3 py-2">
      <span
        className={cn(
          "mt-px flex size-4 shrink-0 items-center justify-center rounded-full",
          check.passed ? "bg-up/12 text-up" : "bg-down/12 text-down",
        )}
      >
        <Icon className="size-3" strokeWidth={2.5} aria-hidden />
        <span className="sr-only">{check.passed ? "Passed" : "Failed"}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-dense text-fg">{check.name}</span>
          {check.value || check.limit ? (
            <span className="shrink-0 num text-xs text-fg-muted">
              {check.value}
              {check.limit ? <span className="text-fg-subtle"> · {check.limit}</span> : null}
            </span>
          ) : null}
        </div>
        {check.detail ? <p className="mt-0.5 text-xs text-fg-subtle">{check.detail}</p> : null}
      </div>
    </li>
  );
}

/** Candles with markers and entry / stop / target lines (the shared Lightweight chart). */
export function DetailChart({
  candles,
  timeframe,
  markers,
  levels,
  live,
  loading,
  viewKey,
  height = 280,
}: {
  candles: Candle[];
  timeframe: Timeframe;
  markers?: ChartMarker[];
  levels?: PriceLevel[];
  live?: { symbol: string; timeframe: Timeframe };
  loading?: boolean;
  viewKey?: string;
  height?: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line-subtle">
      <CandlestickChart
        candles={candles}
        timeframe={timeframe}
        markers={markers}
        levels={levels}
        live={live}
        loading={loading}
        viewKey={viewKey}
        initialBars={Math.max(candles.length, 1)}
        height={height}
        showVolume
      />
    </div>
  );
}

/** The AI's reasoning for a decision, rendered by the shared AI-analysis component. */
export function DetailAnalysis({ analysis }: { analysis: AIAnalysis }) {
  return <AnalysisDetails analysis={analysis} compact />;
}

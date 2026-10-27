import { CircleSlash } from "lucide-react";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { EnumBadge } from "@/components/ui/EnumBadge";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Timestamp } from "@/components/ui/Timestamp";
import { cn } from "@/lib/cn";
import { formatPct, formatPrice, formatSignedPct, isNum } from "@/lib/format";
import type { AIAnalysis } from "@/types";
import { formatRiskReward, hasLevels, levelDistancePct } from "./analysis-model";
import {
  EvaluationLine,
  EvidenceList,
  LevelTile,
  ProviderFootnote,
  ReasoningDisclosure,
  RiskVerdict,
  SectionLabel,
  SignalPill,
} from "./parts";

export interface AnalysisDetailsProps {
  analysis: AIAnalysis;
  /** Minimum confidence to trade (RiskSnapshot.min_confidence) — drawn as a tick on the meter. */
  threshold?: number;
  /** Hide the signal / confidence header (when the container already shows it). */
  hideHeader?: boolean;
  /** Open the detailed reasoning initially. */
  defaultExpanded?: boolean;
  /** Narrow containers (drawers, the Overview card): single-column evidence lists. */
  compact?: boolean;
  className?: string;
}

/**
 * The canonical renderer of one AI decision: signal, confidence, regime, entry / stop / target and
 * risk-reward, WHY ✓ / RISKS ⚠ / invalidation, the risk manager's verdict with every check, the
 * shadow evaluation, expandable detailed reasoning and the provider footnote. Never raw JSON.
 *
 *   <AnalysisDetails analysis={detail.analysis} threshold={risk?.min_confidence} compact />
 */
export function AnalysisDetails({
  analysis: a,
  threshold,
  hideHeader,
  defaultExpanded,
  compact,
  className,
}: AnalysisDetailsProps) {
  const levels = hasLevels(a);
  const slPct = levelDistancePct(a.entry, a.stop_loss);
  const tpPct = levelDistancePct(a.entry, a.take_profit);

  return (
    <div className={cn("space-y-4", className)}>
      {hideHeader ? null : (
        <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
          <div>
            <SectionLabel>Signal</SectionLabel>
            <SignalPill signal={a.signal} size="lg" />
          </div>
          <div className="min-w-36">
            <SectionLabel info="How sure the analyst is (0–100 %). The tick marks the minimum confidence the risk manager requires to trade.">
              Confidence
            </SectionLabel>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "text-kpi font-semibold",
                  isNum(threshold) && a.confidence < threshold ? "text-fg-muted" : "text-ai",
                )}
              >
                {formatPct(a.confidence, { decimals: 0 })}
              </span>
              <ConfidenceMeter
                value={a.confidence}
                threshold={threshold}
                variant="bar"
                className="max-w-44 [&>span:first-child]:hidden"
              />
            </div>
          </div>
          <div>
            <SectionLabel info="The market regime the classifier saw at the decision, with its confidence.">
              Market regime
            </SectionLabel>
            <div className="flex items-center gap-2">
              <EnumBadge kind="regime" value={a.regime} size="md" describe />
              <span className="num text-xs text-fg-subtle">
                {formatPct(a.regime_confidence, { decimals: 0 })}
              </span>
            </div>
          </div>
        </div>
      )}

      <p className="text-sm leading-6 text-fg">{a.summary}</p>

      {levels ? (
        <div className={cn("grid grid-cols-2 gap-2", !compact && "md:grid-cols-4")}>
          <LevelTile
            label="Entry"
            value={formatPrice(a.entry, { currency: true })}
            tone="accent"
            sub={`at ${formatPrice(a.price)}`}
          />
          <LevelTile
            label="Stop loss"
            value={formatPrice(a.stop_loss, { currency: true })}
            tone="down"
            sub={isNum(slPct) ? formatSignedPct(slPct) : undefined}
          />
          <LevelTile
            label="Take profit"
            value={formatPrice(a.take_profit, { currency: true })}
            tone="up"
            sub={isNum(tpPct) ? formatSignedPct(tpPct) : undefined}
          />
          <LevelTile
            label="Risk / reward"
            value={formatRiskReward(a.risk_reward)}
            info="Distance to the target ÷ distance to the stop, recomputed from the levels."
            sub={
              isNum(a.risk_reward)
                ? `${formatPct(100 / (1 + a.risk_reward), { decimals: 0 })} breakeven win rate`
                : undefined
            }
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-3 py-2 text-dense text-fg-muted ring-1 ring-line-subtle ring-inset">
          <CircleSlash aria-hidden className="size-4 shrink-0 text-fg-subtle" />
          <span>
            No trade levels — the analyst is standing aside at {formatPrice(a.price, { currency: true })}.
          </span>
        </div>
      )}

      <div className={cn("grid gap-4", !compact && "lg:grid-cols-2")}>
        <div>
          <SectionLabel>Why?</SectionLabel>
          {a.reasons.length ? (
            <EvidenceList items={a.reasons} kind="why" />
          ) : (
            <p className="text-dense text-fg-subtle">No supporting evidence listed.</p>
          )}
        </div>
        <div className="space-y-4">
          {a.risks.length ? (
            <div>
              <SectionLabel>Risks</SectionLabel>
              <EvidenceList items={a.risks} kind="risk" />
            </div>
          ) : null}
          {a.invalidation ? (
            <div>
              <SectionLabel info="The condition that would prove this idea wrong.">Invalidation</SectionLabel>
              <p className="rounded-lg bg-down/[0.06] px-3 py-2 text-dense font-medium text-fg ring-1 ring-down/20 ring-inset">
                {a.invalidation}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <SectionLabel info="Every signal goes through the risk manager; each check is recorded so you can see exactly why it passed or failed.">
          Risk manager
        </SectionLabel>
        <RiskVerdict risk={a.risk} signal={a.signal} />
      </div>

      {a.evaluation.status !== "NOT_APPLICABLE" ? (
        <div>
          <SectionLabel info="Every directional signal is tracked virtually, traded or not: Correct = target reached before the stop.">
            Shadow evaluation
          </SectionLabel>
          <EvaluationLine evaluation={a.evaluation} />
        </div>
      ) : null}

      <ReasoningDisclosure analysis={a} defaultOpen={defaultExpanded} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <ProviderFootnote analysis={a} className="min-w-0 flex-1" />
        <span className="flex items-center gap-1 text-2xs text-fg-subtle">
          {a.symbol} · {a.timeframe} close ·{" "}
          <Timestamp value={a.created_at} mode="datetime" className="text-2xs" />
          <InfoTooltip content={`Decision ${a.id}`} />
        </span>
      </div>
    </div>
  );
}

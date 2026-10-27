import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BrainCircuit } from "lucide-react";
import { Link } from "react-router";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { EmptyState } from "@/components/ui/EmptyState";
import { EnumBadge } from "@/components/ui/EnumBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { LiveTag } from "@/components/layout/LiveTag";
import { useAiLatest, useRisk, useSymbols } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { formatPrice, formatRelativeTime, formatTime, isNum } from "@/lib/format";
import { motionPresets } from "@/lib/motion";
import { useNow } from "@/lib/time";
import type { AIAnalysis } from "@/types";
import { AnalysisDetails } from "./AnalysisDetails";
import { formatRiskReward, hasLevels } from "./analysis-model";
import { EvidenceList, ProviderFootnote, RiskVerdict, SignalPill } from "./parts";
import { useNextAnalysis } from "./use-next-analysis";

function NoDecision({ symbol }: { symbol: string }) {
  const next = useNextAnalysis();
  return (
    <EmptyState
      size="sm"
      icon={BrainCircuit}
      title="No AI decisions yet"
      description={
        next.atMs
          ? `The analyst runs on every decision-candle close — the next analysis of ${symbol} runs at ${formatTime(next.atMs, { seconds: false })}.`
          : `The analyst runs on every decision-candle close; ${symbol}'s first analysis appears here as soon as it is made.`
      }
    />
  );
}

function AnalysisSkeleton() {
  return (
    <div className="space-y-4 px-4 pb-4">
      <div className="flex gap-5">
        <Skeleton className="h-10 w-24 rounded-lg" />
        <Skeleton className="h-10 flex-1 rounded-lg" />
      </div>
      <SkeletonText lines={2} />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
      <SkeletonText lines={4} />
    </div>
  );
}

function Subtitle({ analysis }: { analysis: AIAnalysis }) {
  const now = useNow();
  const next = useNextAnalysis();
  return (
    <span className="num">
      {analysis.symbol} · {analysis.timeframe} close · {formatRelativeTime(analysis.created_at, now)}
      {next.label ? <span className="hidden sm:inline"> · {next.label}</span> : null}
    </span>
  );
}

/**
 * The large AI market analysis panel for one symbol: what the AI currently thinks, live (the
 * `ai_analysis` frame replaces it the moment a new decision is made).
 */
export function LiveAnalysisCard({ symbol: symbolProp, className }: { symbol?: string; className?: string }) {
  const { primary } = useSymbols();
  const symbol = symbolProp ?? primary;
  const q = useAiLatest(symbol);
  const risk = useRisk();
  const analysis = q.data;
  return (
    <Card className={className}>
      <CardHeader
        title="AI market analysis"
        icon={BrainCircuit}
        badge={<LiveTag />}
        subtitle={analysis ? <Subtitle analysis={analysis} /> : symbol}
        info="The analyst's latest decision for this symbol: its signal, confidence, proposed levels, the evidence for and against, and what the risk manager made of it."
        actions={analysis ? <EnumBadge kind="provider" value={analysis.provider} describe /> : undefined}
      />
      {q.isPending && symbol ? (
        <AnalysisSkeleton />
      ) : q.error && !analysis ? (
        <div className="px-4 pb-4">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </div>
      ) : !analysis || !symbol ? (
        <NoDecision symbol={symbol ?? "this symbol"} />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={analysis.id} {...motionPresets.fade} className="px-4 pb-4">
            <AnalysisDetails analysis={analysis} threshold={risk.data?.min_confidence} />
          </motion.div>
        </AnimatePresence>
      )}
    </Card>
  );
}

/** Overview widget: the latest AI decision in brief, with a link to the full reasoning. */
export function LatestDecisionCard({
  symbol: symbolProp,
  className,
}: {
  symbol?: string;
  className?: string;
}) {
  const { primary } = useSymbols();
  const symbol = symbolProp ?? primary;
  const q = useAiLatest(symbol);
  const risk = useRisk();
  const a = q.data;
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title="Latest AI decision"
        icon={BrainCircuit}
        badge={<LiveTag />}
        subtitle={a ? <Subtitle analysis={a} /> : symbol}
        actions={
          symbol ? (
            <Link
              to={`/ai?symbol=${encodeURIComponent(symbol)}`}
              className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent/70"
            >
              Reasoning <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          ) : undefined
        }
      />
      {q.isPending && symbol ? (
        <div className="space-y-3 px-4 pb-4">
          <Skeleton className="h-10 w-full rounded-lg" />
          <SkeletonText lines={3} />
        </div>
      ) : q.error && !a ? (
        <div className="px-4 pb-4">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
        </div>
      ) : !a ? (
        <NoDecision symbol={symbol ?? "this symbol"} />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={a.id} {...motionPresets.fade} className="space-y-3 px-4 pb-4">
            <div className="flex items-center gap-3">
              <SignalPill signal={a.signal} />
              <div className="min-w-0 flex-1">
                <ConfidenceMeter value={a.confidence} threshold={risk.data?.min_confidence} variant="bar" />
              </div>
              <EnumBadge kind="regime" value={a.regime} short describe />
            </div>
            {hasLevels(a) ? (
              <dl className="grid grid-cols-4 gap-2 text-xs">
                {[
                  { label: "Entry", value: formatPrice(a.entry), cls: "text-accent" },
                  { label: "Stop", value: formatPrice(a.stop_loss), cls: "text-down" },
                  { label: "Target", value: formatPrice(a.take_profit), cls: "text-up" },
                  {
                    label: "R : R",
                    value: isNum(a.risk_reward) ? formatRiskReward(a.risk_reward) : "—",
                    cls: "text-fg",
                  },
                ].map((item) => (
                  <div key={item.label} className="min-w-0">
                    <dt className="text-2xs text-fg-subtle">{item.label}</dt>
                    <dd className={cn("truncate num text-dense", item.cls)}>{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <p className="line-clamp-3 text-dense leading-5 text-fg-muted">{a.summary}</p>
            <EvidenceList items={a.reasons.slice(0, 3)} kind="why" />
            {a.risks.length ? <EvidenceList items={a.risks.slice(0, 1)} kind="risk" /> : null}
            {a.invalidation ? (
              <p className="text-xs text-fg-muted">
                <span className="mr-1.5 label-caps text-fg-subtle">Invalidation</span>
                {a.invalidation}
              </p>
            ) : null}
            <RiskVerdict risk={a.risk} signal={a.signal} showChecks={false} />
            <ProviderFootnote analysis={a} />
          </motion.div>
        </AnimatePresence>
      )}
    </Card>
  );
}

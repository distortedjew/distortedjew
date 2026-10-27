import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ScrollText } from "lucide-react";
import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { EmptyState } from "@/components/ui/EmptyState";
import { EnumBadge } from "@/components/ui/EnumBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { SymbolLabel } from "@/components/ui/SymbolLabel";
import { LiveTag } from "@/components/layout/LiveTag";
import { useAiHistory, useRisk, useSymbols } from "@/hooks/queries";
import { useUrlNumber, useUrlState } from "@/hooks/use-url-state";
import { cn } from "@/lib/cn";
import { AI_PROVIDER_META, RISK_STATUS_META } from "@/lib/constants";
import { formatDayLabel, formatInt, formatTime, formatUtc } from "@/lib/format";
import { motionPresets } from "@/lib/motion";
import { useNow } from "@/lib/time";
import type { AIAnalysis, AIProvider, AiHistoryFilters, RiskStatus, Signal } from "@/types";
import { AnalysisDetails } from "./AnalysisDetails";
import { useNextAnalysis } from "./use-next-analysis";
import { SignalPill } from "./parts";

const PAGE_SIZE = 50;

type SignalFilter = "all" | Signal;
type RiskFilter = "all" | RiskStatus;
type ProviderFilter = "all" | AIProvider;
type ConfFilter = "0" | "50" | "60" | "70" | "80" | "90";

const SIGNAL_OPTIONS: { value: SignalFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "LONG", label: "Long" },
  { value: "SHORT", label: "Short" },
  { value: "HOLD", label: "Hold" },
];
const RISK_VALUES: RiskFilter[] = ["all", "APPROVED", "REJECTED", "NOT_APPLICABLE"];
const PROVIDER_VALUES: ProviderFilter[] = ["all", "openrouter", "heuristic"];
const CONF_VALUES: ConfFilter[] = ["0", "50", "60", "70", "80", "90"];

function RowSummary({ a }: { a: AIAnalysis }) {
  const risk = RISK_STATUS_META[a.risk.status];
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-dense text-fg-muted">
          <span className="font-medium text-ai">AI</span>
          <span aria-hidden>→</span>
          <SignalPill signal={a.signal} size="sm" />
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
          Confidence
          <ConfidenceMeter value={a.confidence} />
        </span>
        <EnumBadge kind="regime" value={a.regime} short size="sm" className="hidden sm:inline-flex" />
      </div>
      {a.reasons.length ? (
        <p className="line-clamp-2 text-xs leading-5 text-fg-muted sm:line-clamp-1">
          <span className="text-fg-subtle">Reasons: </span>
          {a.reasons.slice(0, 3).map((r, i) => (
            <span key={i}>
              {i ? <span className="px-1 text-fg-disabled">•</span> : null}
              {r}
            </span>
          ))}
        </p>
      ) : null}
      {a.signal !== "HOLD" ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-fg-subtle">Risk manager:</span>
          <span
            className={cn(
              "font-semibold tracking-[0.04em] uppercase",
              a.risk.status === "APPROVED"
                ? "text-up"
                : a.risk.status === "REJECTED"
                  ? "text-down"
                  : "text-fg-muted",
            )}
          >
            {a.risk.status === "APPROVED"
              ? "✓ Approved"
              : a.risk.status === "REJECTED"
                ? "✕ Rejected"
                : risk.label}
          </span>
          {a.risk.status === "REJECTED" && a.risk.reasons.length ? (
            <span className="min-w-0 truncate text-fg-muted">Reason: {a.risk.reasons.join(" · ")}</span>
          ) : null}
          {a.evaluation.status !== "NOT_APPLICABLE" ? (
            <EnumBadge kind="evalStatus" value={a.evaluation.status} size="xs" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DecisionRow({ a, threshold }: { a: AIAnalysis; threshold?: number }) {
  const [open, setOpen] = useState(false);
  const panelId = `decision-${a.id}`;
  return (
    <div className={cn("border-b border-line-subtle last:border-b-0", open && "bg-fg/[0.02]")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-fg/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent/70"
      >
        <div className="w-[4.5rem] shrink-0 sm:w-28">
          <div className="num text-dense text-fg" title={formatUtc(a.created_at)}>
            {formatTime(a.created_at)}
          </div>
          <div className="mt-1">
            <SymbolLabel symbol={a.symbol} size="sm" monogram={false} quote={false} className="sm:hidden" />
            <SymbolLabel symbol={a.symbol} size="sm" className="hidden sm:inline-flex" />
          </div>
        </div>
        <RowSummary a={a} />
        <ChevronDown
          aria-hidden
          className={cn(
            "mt-1 size-4 shrink-0 text-fg-subtle transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <motion.div id={panelId} {...motionPresets.fadeRise} className="px-4 pt-1 pb-4 sm:pl-[8.75rem]">
          <AnalysisDetails analysis={a} threshold={threshold} />
        </motion.div>
      ) : null}
    </div>
  );
}

/** Chronological AI decision feed with filters; new decisions slide in live; every row expands. */
export function DecisionLog() {
  const { symbols } = useSymbols();
  const risk = useRisk();
  const now = useNow();
  const next = useNextAnalysis();
  const [symbol, setSymbol] = useUrlState("dsym", "all");
  const [signal, setSignal] = useUrlState<SignalFilter>("dsig", "all", ["all", "LONG", "SHORT", "HOLD"]);
  const [riskStatus, setRiskStatus] = useUrlState<RiskFilter>("drisk", "all", RISK_VALUES);
  const [provider, setProvider] = useUrlState<ProviderFilter>("dprov", "all", PROVIDER_VALUES);
  const [conf, setConf] = useUrlState<ConfFilter>("dconf", "0", CONF_VALUES);
  const [offset, setOffset] = useUrlNumber("doff", 0);

  const filters: AiHistoryFilters = {
    symbol: symbol === "all" ? undefined : symbol,
    signal: signal === "all" ? undefined : signal,
    risk_status: riskStatus === "all" ? undefined : riskStatus,
    provider: provider === "all" ? undefined : provider,
    min_confidence: conf === "0" ? undefined : Number(conf),
    limit: PAGE_SIZE,
    offset,
  };
  const q = useAiHistory(filters);
  const items = q.data?.items ?? [];
  const filtered =
    symbol !== "all" || signal !== "all" || riskStatus !== "all" || provider !== "all" || conf !== "0";
  const resetPage =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      setOffset(0);
      fn(v);
    };

  const rows = items.map((a, i) => {
    const day = formatDayLabel(a.created_at, now);
    const prev = i > 0 ? formatDayLabel(items[i - 1].created_at, now) : null;
    return { a, day: day !== prev ? day : null };
  });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SegmentedControl
          aria-label="Signal"
          options={SIGNAL_OPTIONS}
          value={signal}
          onValueChange={resetPage(setSignal)}
        />
        <Select
          aria-label="Symbol"
          size="sm"
          className="w-36"
          value={symbol}
          onValueChange={resetPage(setSymbol)}
          options={[{ value: "all", label: "All symbols" }, ...symbols.map((s) => ({ value: s, label: s }))]}
        />
        <Select
          aria-label="Risk manager verdict"
          size="sm"
          className="w-40"
          value={riskStatus}
          onValueChange={resetPage(setRiskStatus)}
          options={RISK_VALUES.map((v) => ({
            value: v,
            label: v === "all" ? "Any verdict" : RISK_STATUS_META[v].label,
          }))}
        />
        <Select
          aria-label="Provider"
          size="sm"
          className="w-36"
          value={provider}
          onValueChange={resetPage(setProvider)}
          options={PROVIDER_VALUES.map((v) => ({
            value: v,
            label: v === "all" ? "Any provider" : AI_PROVIDER_META[v].label,
          }))}
        />
        <Select
          aria-label="Minimum confidence"
          size="sm"
          className="w-36"
          value={conf}
          onValueChange={resetPage(setConf)}
          options={CONF_VALUES.map((v) => ({ value: v, label: v === "0" ? "Any confidence" : `≥ ${v}%` }))}
        />
      </div>
      <Card>
        <CardHeader
          title="AI decision log"
          icon={ScrollText}
          badge={<LiveTag />}
          subtitle={
            q.data
              ? `${formatInt(q.data.total)} decisions${filtered ? " match" : ""}${next.label ? ` · ${next.label}` : ""}`
              : undefined
          }
          info="Every analysis the AI made, newest first: its signal and confidence, the evidence, and what the risk manager decided. Click a row for the full reasoning, every risk check and the shadow evaluation."
          borderless={false}
        />
        {q.isPending ? (
          <div className="space-y-px">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex gap-3 px-4 py-3">
                <Skeleton className="h-9 w-24" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-56" />
                  <Skeleton className="h-3 w-full max-w-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : q.error && !q.data ? (
          <div className="p-4">
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={filtered ? "No decisions match these filters" : "No AI decisions yet"}
            description={
              filtered
                ? "Try a wider confidence range or another symbol."
                : `The analyst runs on every decision-candle close${next.atMs ? ` — the next analysis runs at ${formatTime(next.atMs, { seconds: false })}` : ""}.`
            }
          />
        ) : (
          <div
            className={cn(
              "transition-opacity duration-200",
              q.isFetching && !q.isPending && offset > 0 && "opacity-60",
            )}
            role="feed"
            aria-busy={q.isFetching}
          >
            <AnimatePresence initial={false}>
              {rows.map(({ a, day }) => (
                <motion.article
                  key={a.id}
                  layout="position"
                  {...motionPresets.listItem}
                  aria-label={`${a.symbol} ${a.signal} ${Math.round(a.confidence)}%`}
                >
                  {day ? (
                    <div className="border-b border-line-subtle bg-fg/[0.02] px-4 py-1.5 label-caps text-fg-subtle">
                      {day}
                    </div>
                  ) : null}
                  <DecisionRow a={a} threshold={risk.data?.min_confidence} />
                </motion.article>
              ))}
            </AnimatePresence>
          </div>
        )}
        {q.data && q.data.total > PAGE_SIZE ? (
          <div className="border-t border-line px-4 py-2.5">
            <Pagination
              offset={offset}
              limit={PAGE_SIZE}
              total={q.data.total}
              onOffsetChange={setOffset}
              noun="decisions"
              disabled={q.isFetching}
            />
          </div>
        ) : null}
      </Card>
    </>
  );
}

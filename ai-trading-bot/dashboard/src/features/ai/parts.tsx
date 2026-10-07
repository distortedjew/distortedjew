/**
 * Building blocks of the AI reasoning views: signal pill, level tiles, evidence lists, risk
 * manager verdict, shadow evaluation, detailed reasoning and the provider footnote.
 */
import * as Collapsible from "@radix-ui/react-collapsible";
import { Check, ChevronDown, CircleAlert, OctagonX, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { cn } from "@/lib/cn";
import {
  AI_PROVIDER_META,
  EVAL_STATUS_META,
  RISK_STATUS_META,
  SIGNAL_META,
  STRATEGY_META,
} from "@/lib/constants";
import {
  formatInt,
  formatMs,
  formatNumber,
  formatPct,
  formatPrice,
  formatSignedPct,
  formatSize,
  formatUsd,
  isNum,
} from "@/lib/format";
import { TONE_SOFT, TONE_TEXT } from "@/lib/tones";
import type { AIAnalysis, IndicatorSnapshot, RiskDecision, Signal, SignalEvaluation } from "@/types";
import { parseReasoning, splitClauses } from "./analysis-model";

// ---------------------------------------------------------------- signal

export function SignalPill({
  signal,
  size = "md",
  className,
}: {
  signal: Signal;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const meta = SIGNAL_META[signal];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg font-semibold tracking-[0.06em] uppercase ring-1 ring-inset",
        TONE_SOFT[meta.tone],
        signal === "HOLD" && "text-fg",
        size === "lg" && "h-10 px-3.5 text-lg [&_svg]:size-5",
        size === "md" && "h-8 px-2.5 text-sm [&_svg]:size-4",
        size === "sm" && "h-6 px-2 text-xs [&_svg]:size-3.5",
        className,
      )}
    >
      <Icon aria-hidden strokeWidth={2.5} />
      {signal}
    </span>
  );
}

// ---------------------------------------------------------------- section label

export function SectionLabel({
  children,
  info,
  className,
}: {
  children: ReactNode;
  info?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-1.5 flex items-center gap-1 label-caps text-fg-subtle", className)}>
      <span>{children}</span>
      {info ? <InfoTooltip content={info} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- level tiles

export function LevelTile({
  label,
  value,
  sub,
  tone,
  info,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "up" | "down" | "accent" | "ai";
  info?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-2/70 px-3 py-2 ring-1 ring-line-subtle ring-inset">
      <div className="flex items-center gap-1 text-xs text-fg-subtle">
        <span className="truncate">{label}</span>
        {info ? <InfoTooltip content={info} /> : null}
      </div>
      <div className={cn("mt-0.5 truncate num text-[15px] font-medium text-fg", tone && TONE_TEXT[tone])}>
        {value}
      </div>
      {sub ? <div className="truncate num text-xs text-fg-subtle">{sub}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- evidence lists

export function EvidenceList({
  items,
  kind,
  className,
}: {
  items: readonly string[];
  kind: "why" | "risk";
  className?: string;
}) {
  if (!items.length) return null;
  const Icon = kind === "why" ? Check : TriangleAlert;
  return (
    <ul className={cn("space-y-1", className)}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-dense leading-5 text-fg">
          <Icon
            aria-hidden
            strokeWidth={2.5}
            className={cn("mt-[3px] size-3.5 shrink-0", kind === "why" ? "text-up" : "text-warning")}
          />
          <span className="sr-only">{kind === "why" ? "Supporting: " : "Risk: "}</span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- risk manager

export function RiskVerdict({
  risk,
  signal,
  showChecks = true,
  className,
}: {
  risk: RiskDecision;
  signal: Signal;
  showChecks?: boolean;
  className?: string;
}) {
  const meta = RISK_STATUS_META[risk.status];
  const failed = risk.checks.filter((c) => !c.passed);
  const VerdictIcon =
    risk.status === "APPROVED" ? ShieldCheck : risk.status === "REJECTED" ? OctagonX : meta.icon;
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={meta.tone} size="md" icon={VerdictIcon} caps>
          {risk.status === "APPROVED" ? "✓ Approved" : risk.status === "REJECTED" ? "✕ Rejected" : meta.label}
        </Badge>
        {risk.status === "REJECTED" && risk.reasons.length ? (
          <span className="text-dense text-fg-muted">{risk.reasons.join(" · ")}</span>
        ) : null}
        {risk.status === "NOT_APPLICABLE" ? (
          <span className="text-dense text-fg-muted">
            {signal === "HOLD" ? "HOLD — nothing to execute." : risk.reasons.join(" · ") || meta.description}
          </span>
        ) : null}
        {risk.status === "APPROVED" && isNum(risk.notional) ? (
          <span className="num text-xs text-fg-muted">
            Size {formatSize(risk.position_size)} · {formatUsd(risk.notional)} notional · risk{" "}
            {formatUsd(risk.risk_amount)}
            {isNum(risk.risk_pct) ? ` (${formatPct(risk.risk_pct)})` : ""}
          </span>
        ) : null}
      </div>
      {showChecks && risk.checks.length ? (
        <ul
          className="grid gap-x-4 gap-y-0.5 rounded-lg bg-surface-2/60 px-3 py-2 ring-1 ring-line-subtle ring-inset md:grid-cols-2"
          aria-label={`Risk checks: ${risk.checks.length - failed.length} of ${risk.checks.length} passed`}
        >
          {risk.checks.map((check) => (
            <li key={check.name} className="flex min-w-0 items-start gap-2 py-0.5 text-xs">
              {check.passed ? (
                <Check aria-label="passed" strokeWidth={2.75} className="mt-0.5 size-3.5 shrink-0 text-up" />
              ) : (
                <X aria-label="failed" strokeWidth={2.75} className="mt-0.5 size-3.5 shrink-0 text-down" />
              )}
              <span className="min-w-0 flex-1">
                <span className={cn("text-fg-muted", !check.passed && "font-medium text-fg")}>
                  {check.name}
                </span>
                {check.detail ? (
                  <span className="block text-2xs leading-4 text-fg-subtle">{check.detail}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-right num text-fg-muted">
                <span className={cn(!check.passed && "text-down")}>{check.value ?? "—"}</span>
                {check.limit ? <span className="text-fg-subtle"> / {check.limit}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- shadow evaluation

export function EvaluationLine({ evaluation }: { evaluation: SignalEvaluation }) {
  if (evaluation.status === "NOT_APPLICABLE") return null;
  const meta = EVAL_STATUS_META[evaluation.status];
  const hit =
    evaluation.hit === "TP"
      ? "target hit first"
      : evaluation.hit === "SL"
        ? "stop hit first"
        : evaluation.hit === "HORIZON"
          ? "horizon reached"
          : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-dense">
      <Badge tone={meta.tone} icon={meta.icon}>
        {meta.label}
      </Badge>
      <span className="text-fg-muted">
        {evaluation.status === "PENDING"
          ? "Waiting for the virtual target, stop or horizon."
          : [
              hit,
              isNum(evaluation.return_pct)
                ? `${formatSignedPct(evaluation.return_pct)} in the signal's direction`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- detailed reasoning

const INDICATOR_ROWS: {
  key: keyof IndicatorSnapshot;
  label: string;
  fmt: (v: number) => string;
  info: string;
}[] = [
  {
    key: "rsi",
    label: "RSI 14",
    fmt: (v) => formatNumber(v, 1),
    info: "Relative Strength Index: above 70 overbought, below 30 oversold.",
  },
  {
    key: "macd_hist",
    label: "MACD hist",
    fmt: (v) => formatNumber(v, 2, { signed: true }),
    info: "MACD minus its signal line; positive and rising = bullish momentum.",
  },
  {
    key: "adx",
    label: "ADX",
    fmt: (v) => formatNumber(v, 1),
    info: "Average Directional Index: above 25 = a strong trend, below 20 = weak / ranging.",
  },
  {
    key: "atr_pct",
    label: "ATR %",
    fmt: (v) => formatPct(v, { decimals: 3 }),
    info: "Average True Range as a percent of price — typical bar size.",
  },
  {
    key: "bb_width_pct",
    label: "BB width",
    fmt: (v) => formatPct(v),
    info: "Bollinger Band width as a percent of price; low values = compression.",
  },
  {
    key: "volume_ratio",
    label: "Volume",
    fmt: (v) => `${formatNumber(v, 2)}×`,
    info: "Volume of the decision candle ÷ its 20-bar average.",
  },
  {
    key: "ema21",
    label: "EMA 21",
    fmt: (v) => formatPrice(v),
    info: "21-period EMA at the decision candle.",
  },
  {
    key: "ema50",
    label: "EMA 50",
    fmt: (v) => formatPrice(v),
    info: "50-period EMA at the decision candle.",
  },
];

export function IndicatorStrip({ indicators }: { indicators: IndicatorSnapshot }) {
  const rows = INDICATOR_ROWS.filter((r) => isNum(indicators[r.key]));
  if (!rows.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 xs:grid-cols-4">
      {rows.map((r) => (
        <div key={r.key} className="min-w-0">
          <dt className="flex items-center gap-1 text-2xs text-fg-subtle">
            {r.label}
            <InfoTooltip content={r.info} />
          </dt>
          <dd className="num text-xs text-fg">{r.fmt(indicators[r.key] as number)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReasoningSections({ text }: { text: string }) {
  const sections = parseReasoning(text);
  if (!sections.length)
    return <p className="text-dense text-fg-subtle">No detailed reasoning was recorded.</p>;
  return (
    <div className="space-y-2.5">
      {sections.map((section, i) => {
        const clauses = splitClauses(section.body);
        return (
          <div key={i} className="text-dense leading-5">
            {section.title ? (
              <div className="mb-0.5 text-xs font-semibold text-fg">{section.title}</div>
            ) : null}
            {clauses.length > 1 ? (
              <ul className="list-disc space-y-0.5 pl-4 text-fg-muted marker:text-fg-disabled">
                {clauses.map((c, j) => (
                  <li key={j}>{c}</li>
                ))}
              </ul>
            ) : (
              <p className="text-fg-muted">{section.body}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** "Detailed reasoning" disclosure (keyboard accessible, collapsed by default). */
export function ReasoningDisclosure({
  analysis,
  defaultOpen = false,
  children,
}: {
  analysis: AIAnalysis;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger
        className={cn(
          "group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-dense font-medium text-fg-muted ring-1 ring-line transition-colors ring-inset",
          "hover:bg-fg/[0.04] hover:text-fg focus-visible:outline-2 focus-visible:outline-accent/70",
          open && "rounded-b-none bg-fg/[0.03] text-fg",
        )}
      >
        <span>{open ? "Hide detailed reasoning" : "Show detailed reasoning"}</span>
        <ChevronDown
          aria-hidden
          className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180"
        />
      </Collapsible.Trigger>
      <Collapsible.Content className="overflow-hidden">
        <div className="space-y-4 rounded-b-lg px-3 py-3 ring-1 ring-line ring-inset">
          <ReasoningSections text={analysis.detailed_reasoning} />
          <div>
            <SectionLabel>Indicators at decision</SectionLabel>
            <IndicatorStrip indicators={analysis.indicators} />
          </div>
          {children}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

// ---------------------------------------------------------------- provider footnote

export function ProviderFootnote({ analysis, className }: { analysis: AIAnalysis; className?: string }) {
  const provider = AI_PROVIDER_META[analysis.provider];
  const strategy = STRATEGY_META[analysis.strategy];
  const tokens = analysis.prompt_tokens + analysis.completion_tokens;
  const parts = [
    provider.label,
    analysis.model,
    analysis.provider === "openrouter" ? formatMs(analysis.latency_ms) : null,
    tokens > 0 ? `${formatInt(tokens)} tokens` : null,
    analysis.provider === "openrouter" ? formatUsd(analysis.cost_usd, { decimals: 4 }) : null,
    `${strategy.label} strategy`,
    analysis.baseline_signal && analysis.strategy !== "baseline"
      ? `baseline said ${analysis.baseline_signal}`
      : null,
  ].filter(Boolean);
  return (
    <div className={cn("space-y-2", className)}>
      {analysis.fallback_reason ? (
        <div className="flex gap-2 rounded-lg bg-warning/8 px-3 py-2 text-xs text-fg-muted ring-1 ring-warning/25 ring-inset">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0 text-warning" />
          <span>
            <span className="font-medium text-fg">
              OpenRouter was unavailable, so the local heuristic model answered.
            </span>{" "}
            {analysis.fallback_reason}
          </span>
        </div>
      ) : null}
      <p className="num text-2xs leading-4 text-fg-subtle">
        {parts.join(" · ")}
        {analysis.provider === "heuristic" && !analysis.fallback_reason ? (
          <span className="font-sans"> — local rule-based analyst, no LLM call</span>
        ) : null}
      </p>
    </div>
  );
}

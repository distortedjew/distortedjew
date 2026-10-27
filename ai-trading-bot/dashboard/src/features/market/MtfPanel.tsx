import { Layers3 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";
import { LiveTag } from "@/components/layout/LiveTag";
import { useMtf, useSymbols } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { EMA_ALIGNMENT_META, SIGNAL_META, TREND_META } from "@/lib/constants";
import { formatNumber, formatSignedPct, isNum } from "@/lib/format";
import { TONE_BG, TONE_SOFT, TONE_TEXT } from "@/lib/tones";
import type { MTFReport, TimeframeSignal, Trend } from "@/types";
import { timeframeShort } from "./chart-model";
import { alignmentTone } from "./mtf-model";

function TrendChip({ trend }: { trend: Trend }) {
  const meta = TREND_META[trend];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs font-semibold tracking-[0.04em] uppercase ring-1 ring-inset",
        TONE_SOFT[meta.tone],
      )}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2.25} />
      {meta.short ?? meta.label}
    </span>
  );
}

/** RSI value with a slim 0–100 scale marking the 30 / 70 zones. */
function RsiScale({ rsi }: { rsi: number | null | undefined }) {
  if (!isNum(rsi)) return <span className="num text-fg-subtle">—</span>;
  const zone = rsi >= 70 ? "overbought" : rsi <= 30 ? "oversold" : "neutral zone";
  return (
    <span className="flex items-center gap-2" title={`RSI ${formatNumber(rsi, 1)} (${zone})`}>
      <span
        className={cn("w-6 text-right num text-dense", rsi >= 70 || rsi <= 30 ? "text-warning" : "text-fg")}
      >
        {formatNumber(rsi, 0)}
      </span>
      <span aria-hidden className="relative hidden h-1.5 w-10 rounded-full bg-fg/[0.07] @[17rem]:block">
        <span className="absolute inset-y-0 left-[30%] w-[40%] bg-fg/[0.07]" />
        <span className="absolute inset-y-[-2px] left-[30%] w-px bg-fg/25" />
        <span className="absolute inset-y-[-2px] left-[70%] w-px bg-fg/25" />
        <span
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg ring-2 ring-surface"
          style={{ left: `${Math.max(0, Math.min(100, rsi))}%` }}
        />
      </span>
    </span>
  );
}

function StrengthBar({ row }: { row: TimeframeSignal }) {
  const tone = TREND_META[row.trend].tone;
  const pct = Math.max(0, Math.min(100, row.strength));
  return (
    <span className="flex items-center gap-2" title={`Directional strength ${formatNumber(pct, 0)} / 100`}>
      <span aria-hidden className="h-1.5 w-8 overflow-hidden rounded-full bg-fg/[0.07]">
        <span
          className={cn("block h-full rounded-full", tone === "neutral" ? "bg-fg-subtle" : TONE_BG[tone])}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-6 text-right num text-xs text-fg-muted">{formatNumber(pct, 0)}</span>
    </span>
  );
}

function SignalTag({ row }: { row: TimeframeSignal }) {
  const meta = SIGNAL_META[row.signal];
  return (
    <span
      className={cn(
        "num text-xs font-semibold tracking-[0.04em]",
        row.signal === "HOLD" ? "text-fg-muted" : TONE_TEXT[meta.tone],
      )}
    >
      {row.signal}
    </span>
  );
}

/** "4/4 TIMEFRAMES ALIGNED · BULLISH" with one dot per timeframe. */
export function AlignmentHeadline({ report }: { report: MTFReport }) {
  const tone = alignmentTone(report);
  const dominant = TREND_META[report.dominant];
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg px-3 py-2 ring-1 ring-inset",
        TONE_SOFT[tone],
      )}
    >
      <div className="flex items-center gap-2">
        <span className="num text-xs font-semibold tracking-[0.06em] uppercase">
          {report.alignment_label}
          {report.dominant !== "NEUTRAL" ? ` · ${dominant.label}` : ""}
        </span>
        <InfoTooltip content="How many timeframes agree with the dominant trend. The AI weighs alignment heavily: trades against the higher timeframes are riskier." />
      </div>
      <div
        className="flex items-center gap-1"
        aria-label={report.timeframes.map((t) => `${t.timeframe} ${TREND_META[t.trend].label}`).join(", ")}
      >
        {report.timeframes.map((t) => (
          <Tooltip
            key={t.timeframe}
            content={`${timeframeShort(t.timeframe)} · ${TREND_META[t.trend].label}`}
          >
            <span
              tabIndex={-1}
              className={cn(
                "h-2 w-5 rounded-full",
                t.trend === "NEUTRAL" ? "bg-fg/20" : TONE_BG[TREND_META[t.trend].tone],
              )}
            />
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

/** The section-29 table: timeframe · trend · RSI · signal · strength (+ EMA stack when wide). */
export function MtfTable({ report, dense }: { report: MTFReport; dense?: boolean }) {
  return (
    <div role="table" aria-label="Multi-timeframe analysis" className="@container text-dense">
      <div
        role="row"
        className="grid grid-cols-[2.25rem_minmax(4.75rem,1fr)_minmax(2.5rem,1fr)_3rem] items-center gap-1.5 border-b border-line px-1 pb-1.5 label-caps text-fg-subtle @[19.5rem]:grid-cols-[2.25rem_minmax(4.5rem,1fr)_4.5rem_3rem_4rem]"
      >
        <span role="columnheader">TF</span>
        <span role="columnheader">Trend</span>
        <span role="columnheader" className="flex items-center gap-1">
          RSI{" "}
          <InfoTooltip content="RSI 14 on the latest closed candle; the scale marks the 30 (oversold) and 70 (overbought) levels." />
        </span>
        <span role="columnheader">Signal</span>
        <span role="columnheader" className="hidden items-center gap-1 @[19.5rem]:flex">
          Strength{" "}
          <InfoTooltip content="Directional strength 0–100 from EMA alignment, MACD and price vs EMA 200." />
        </span>
      </div>
      {report.timeframes.map((row) => (
        <div
          role="row"
          key={row.timeframe}
          className={cn(
            "grid grid-cols-[2.25rem_minmax(4.75rem,1fr)_minmax(2.5rem,1fr)_3rem] items-center gap-1.5 border-b border-line-subtle px-1 last:border-b-0 @[19.5rem]:grid-cols-[2.25rem_minmax(4.5rem,1fr)_4.5rem_3rem_4rem]",
            dense ? "py-1.5" : "py-2",
          )}
          title={`EMA stack: ${EMA_ALIGNMENT_META[row.ema_alignment].label}${isNum(row.price_vs_ema200_pct) ? ` · price vs EMA 200 ${formatSignedPct(row.price_vs_ema200_pct)}` : ""}`}
        >
          <span role="cell" className="num font-semibold text-fg">
            {timeframeShort(row.timeframe).toUpperCase()}
          </span>
          <span role="cell">
            <TrendChip trend={row.trend} />
          </span>
          <span role="cell">
            <RsiScale rsi={row.rsi} />
          </span>
          <span role="cell">
            <SignalTag row={row} />
          </span>
          <span role="cell" className="hidden @[19.5rem]:block">
            <StrengthBar row={row} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Self-contained multi-timeframe card (Overview + Markets). */
export function MtfCard({ symbol: symbolProp, className }: { symbol?: string; className?: string }) {
  const { primary } = useSymbols();
  const symbol = symbolProp ?? primary;
  const q = useMtf(symbol);
  const report = q.data;
  return (
    <Card className={className}>
      <CardHeader
        title="Multi-timeframe"
        icon={Layers3}
        badge={<LiveTag />}
        subtitle={symbol ? `${symbol} · trend per timeframe` : undefined}
        info="Trend, RSI and signal on each timeframe the engine watches, and how many of them agree. Refreshed on every 1-minute close."
      />
      <div className="space-y-3 px-4 pb-4">
        {q.isPending && symbol ? (
          <>
            <Skeleton className="h-9 w-full rounded-lg" />
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </>
        ) : q.error && !report ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
        ) : !report || report.timeframes.length === 0 ? (
          <EmptyState
            size="sm"
            title="No multi-timeframe report yet"
            description="It is computed on the next 1-minute candle close."
          />
        ) : (
          <>
            <AlignmentHeadline report={report} />
            <MtfTable report={report} dense />
          </>
        )}
      </div>
    </Card>
  );
}

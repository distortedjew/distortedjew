import { Compass } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { PnlText } from "@/components/ui/PnlText";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";
import { LiveTag } from "@/components/layout/LiveTag";
import { useRegime, useSymbols } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { REGIME_META } from "@/lib/constants";
import {
  formatDuration,
  formatInt,
  formatNumber,
  formatPct,
  formatSignedPct,
  formatTime,
  isNum,
} from "@/lib/format";
import { useNow } from "@/lib/time";
import { TONE_BG, TONE_CHIP, TONE_TEXT } from "@/lib/tones";
import type { RegimePerformance, RegimeReport, RegimeState } from "@/types";
import { regimeShares, timelineSegments } from "./regime-model";

const METRICS: { key: string; label: string; fmt: (v: number) => string; info: string }[] = [
  {
    key: "adx",
    label: "ADX",
    fmt: (v) => formatNumber(v, 1),
    info: "Average Directional Index (14): trend strength regardless of direction. Above 25 = trending, below 20 = ranging.",
  },
  {
    key: "atr_pct",
    label: "ATR %",
    fmt: (v) => formatPct(v, { decimals: 2 }),
    info: "Average True Range as a percent of price: the typical size of one bar. High values = volatile.",
  },
  {
    key: "bb_width_pct",
    label: "BB width",
    fmt: (v) => formatPct(v, { decimals: 2 }),
    info: "Bollinger Band width as a percent of price. Narrow bands (a squeeze) often precede breakouts.",
  },
  {
    key: "ema_slope_pct",
    label: "EMA slope",
    fmt: (v) => formatSignedPct(v, 3),
    info: "Change of the EMA 21 over the last bars, percent: the direction and pace of the trend.",
  },
];

function RegimeIcon({ state, size = "md" }: { state: RegimeState; size?: "md" | "lg" }) {
  const meta = REGIME_META[state.regime];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl",
        TONE_CHIP[meta.tone],
        size === "lg" ? "size-11" : "size-9",
      )}
    >
      <Icon aria-hidden className={size === "lg" ? "size-5" : "size-4"} />
    </span>
  );
}

function CurrentRegime({ state, now }: { state: RegimeState; now: number }) {
  const meta = REGIME_META[state.regime];
  const sinceMs = state.since ? Date.parse(state.since) : null;
  return (
    <div className="flex items-center gap-3">
      <RegimeIcon state={state} size="lg" />
      <div className="min-w-0">
        <div className="label-caps text-fg-subtle">Current regime</div>
        <Tooltip content={meta.description}>
          <div
            tabIndex={0}
            className={cn(
              "truncate text-lg leading-6 font-semibold tracking-[0.02em] uppercase",
              TONE_TEXT[meta.tone],
              meta.tone === "muted" && "text-fg-muted",
            )}
          >
            {meta.label}
          </div>
        </Tooltip>
        <div className="mt-0.5 num text-xs text-fg-subtle">
          {formatPct(state.confidence, { decimals: 0 })} confidence
          {sinceMs
            ? ` · for ${formatDuration((now - sinceMs) / 1_000).replace(/ \d+s$/, "")} (since ${formatTime(sinceMs, { seconds: false })})`
            : ""}
        </div>
      </div>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <span aria-hidden className="block h-1 w-full overflow-hidden rounded-full bg-fg/[0.07]">
      <span
        className="block h-full rounded-full bg-fg-muted"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </span>
  );
}

function BotInRegime({ perf, compact }: { perf: RegimePerformance | undefined; compact?: boolean }) {
  if (!perf || perf.trades === 0) {
    return <p className="text-dense text-fg-subtle">The bot has not closed a trade in this regime yet.</p>;
  }
  const items = [
    {
      label: "Win rate",
      value: formatPct(perf.win_rate, { decimals: 0 }),
      info: "Share of closed trades opened in this regime that were profitable.",
    },
    {
      label: "Avg trade",
      value: (
        <span className={TONE_TEXT[(perf.avg_trade_pct ?? 0) >= 0 ? "up" : "down"]}>
          {formatSignedPct(perf.avg_trade_pct)}
        </span>
      ),
      info: "Average net return per trade (percent of notional) for trades opened in this regime.",
    },
    {
      label: "Trades",
      value: formatInt(perf.trades),
      info: "Closed trades that were opened while this regime was active.",
    },
    {
      label: "P&L",
      value: <PnlText value={perf.total_pnl} compact />,
      info: "Total net P&L of those trades.",
    },
  ];
  return (
    <dl className={cn("grid gap-3", compact ? "grid-cols-4" : "grid-cols-2 @[22rem]:grid-cols-4")}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="flex items-center gap-1 text-2xs text-fg-subtle">
            <span className="truncate">{item.label}</span>
            <InfoTooltip content={item.info} />
          </dt>
          <dd className="mt-0.5 num text-dense font-medium text-fg">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const DAY_MS = 86_400_000;

/** Regime history for the last 24 hours as a colored strip (tooltip per segment). */
export function RegimeTimeline({
  report,
  now,
  className,
}: {
  report: RegimeReport;
  now: number;
  className?: string;
}) {
  const start = now - DAY_MS;
  const segments = timelineSegments(report.history, start, now);
  if (!segments.length) return null;
  const shares = regimeShares(segments).slice(0, 3);
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="label-caps text-fg-subtle">Last 24 hours</span>
        <span className="truncate text-2xs text-fg-subtle">
          {shares
            .map((s) => `${REGIME_META[s.regime].short} ${formatPct(s.pct, { decimals: 0 })}`)
            .join(" · ")}
        </span>
      </div>
      <div
        className="relative h-3 overflow-hidden rounded-full bg-fg/[0.05]"
        role="img"
        aria-label={`Regimes over the last 24 hours: ${shares.map((s) => `${REGIME_META[s.regime].label} ${formatPct(s.pct, { decimals: 0 })}`).join(", ")}`}
      >
        {segments.map((seg, i) => {
          const meta = REGIME_META[seg.regime];
          return (
            <Tooltip
              key={`${seg.startMs}-${i}`}
              content={
                <span>
                  <span className="font-medium">{meta.label}</span> ·{" "}
                  {formatTime(seg.startMs, { seconds: false })}–
                  {seg.current ? "now" : formatTime(seg.endMs, { seconds: false })} ·{" "}
                  {formatPct(seg.confidence, { decimals: 0 })}
                </span>
              }
            >
              <span
                className={cn(
                  "absolute inset-y-0 border-r-2 border-surface last:border-r-0",
                  meta.tone === "muted" || meta.tone === "neutral" ? "bg-fg/25" : TONE_BG[meta.tone],
                  seg.current ? "opacity-100" : "opacity-70",
                )}
                style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%` }}
              />
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between num text-2xs text-fg-subtle">
        <span>{formatTime(start, { seconds: false })}</span>
        <span>now</span>
      </div>
    </div>
  );
}

/** Compact per-regime bot performance table. */
export function RegimePerformanceTable({
  performance,
  current,
}: {
  performance: RegimePerformance[];
  current?: string;
}) {
  return (
    <table className="w-full text-xs">
      <caption className="sr-only">Bot performance by market regime</caption>
      <thead>
        <tr className="text-left text-2xs text-fg-subtle">
          <th className="pb-1.5 font-medium">Regime</th>
          <th className="pb-1.5 text-right font-medium">Trades</th>
          <th className="pb-1.5 text-right font-medium">Win rate</th>
          <th className="hidden pb-1.5 text-right font-medium xs:table-cell">Avg trade</th>
          <th className="pb-1.5 text-right font-medium">P&amp;L</th>
        </tr>
      </thead>
      <tbody>
        {performance.map((p) => {
          const meta = REGIME_META[p.regime];
          const Icon = meta.icon;
          return (
            <tr
              key={p.regime}
              className={cn("border-t border-line-subtle", p.regime === current && "bg-accent/[0.06]")}
            >
              <td className="py-1.5 pr-2">
                <span className="inline-flex items-center gap-1.5 text-fg-muted">
                  <Icon aria-hidden className={cn("size-3.5", TONE_TEXT[meta.tone])} />
                  <span className={cn(p.regime === current && "font-medium text-fg")}>
                    {meta.short ?? meta.label}
                  </span>
                </span>
              </td>
              <td className="py-1.5 text-right num text-fg-muted">{formatInt(p.trades)}</td>
              <td className="py-1.5 text-right num text-fg">
                {p.trades ? formatPct(p.win_rate, { decimals: 0 }) : "—"}
              </td>
              <td
                className={cn(
                  "hidden py-1.5 text-right num xs:table-cell",
                  isNum(p.avg_trade_pct) ? TONE_TEXT[p.avg_trade_pct >= 0 ? "up" : "down"] : "text-fg-subtle",
                )}
              >
                {formatSignedPct(p.avg_trade_pct)}
              </td>
              <td className="py-1.5 text-right">
                {p.trades ? (
                  <PnlText value={p.total_pnl} compact />
                ) : (
                  <span className="num text-fg-subtle">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Market regime card. `compact` (Overview): current regime, confidence, duration and how the bot
 * has done in it. Full (Markets): + key metrics, the 24h regime timeline and the per-regime table.
 */
export function RegimeCard({
  symbol: symbolProp,
  variant = "compact",
  className,
}: {
  symbol?: string;
  variant?: "compact" | "full";
  className?: string;
}) {
  const { primary } = useSymbols();
  const symbol = symbolProp ?? primary;
  const q = useRegime(symbol);
  const now = useNow();
  const report = q.data;
  const state = report?.current ?? null;
  const perf = state ? report?.performance.find((p) => p.regime === state.regime) : undefined;

  return (
    <Card className={className}>
      <CardHeader
        title="Market regime"
        icon={Compass}
        badge={<LiveTag />}
        subtitle={symbol}
        info="The regime classifier labels the market on every decision candle from ADX, ATR, Bollinger width and EMA slope. The bot's stops and targets adapt to it."
      />
      <div className="@container space-y-4 px-4 pb-4">
        {q.isPending && symbol ? (
          <>
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-40" />
              </div>
            </div>
            <Skeleton className="h-10 w-full" />
          </>
        ) : q.error && !report ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
        ) : !state ? (
          <EmptyState
            size="sm"
            title="Regime not classified yet"
            description="The first classification runs on the next decision candle close."
          />
        ) : (
          <>
            <CurrentRegime state={state} now={now} />
            <ConfidenceBar value={state.confidence} />
            {variant === "full" ? (
              <dl className="grid grid-cols-2 gap-2 @[26rem]:grid-cols-4">
                {METRICS.map((m) => {
                  const v = state.metrics[m.key];
                  return (
                    <div
                      key={m.key}
                      className="min-w-0 rounded-lg bg-surface-2/60 px-2.5 py-2 ring-1 ring-line-subtle ring-inset"
                    >
                      <dt className="flex items-center gap-1 text-2xs text-fg-subtle">
                        {m.label}
                        <InfoTooltip content={m.info} />
                      </dt>
                      <dd className="mt-0.5 num text-dense text-fg">{isNum(v) ? m.fmt(v) : "—"}</dd>
                    </div>
                  );
                })}
              </dl>
            ) : null}
            <div>
              <div className="mb-1.5 label-caps text-fg-subtle">Bot performance in this regime</div>
              <BotInRegime perf={perf} compact={variant === "compact"} />
            </div>
            {variant === "full" && report ? (
              <>
                <RegimeTimeline report={report} now={now} />
                {report.performance.length ? (
                  <div>
                    <div className="mb-1.5 label-caps text-fg-subtle">By regime</div>
                    <RegimePerformanceTable performance={report.performance} current={state.regime} />
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

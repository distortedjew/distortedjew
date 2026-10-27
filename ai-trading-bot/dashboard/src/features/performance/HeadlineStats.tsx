import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import { formatPct, formatPnl, formatUsd, isNum, toneOf } from "@/lib/format";
import { TONE_TEXT } from "@/lib/tones";
import type { PerformanceReport, Tone } from "@/types";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { performanceMetricItems } from "./performance-logic";
import { MetricValue } from "./parts";

interface Tile {
  key: string;
  label: string;
  info: string;
  node: ReactNode;
  tone: Tone;
  sub?: string;
}

function tiles(report: PerformanceReport): Tile[] {
  const items = Object.fromEntries(performanceMetricItems(report).map((i) => [i.key, i]));
  const m = report.metrics;
  const wr = report.win_loss.win_rate;
  return [
    {
      key: "total_return",
      label: "Total return",
      info: items.total_return.info,
      node: <AnimatedNumber value={m.total_return_pct} format={(n) => formatPct(n, { signed: true })} />,
      tone: toneOf(m.total_return_pct),
      sub: items.total_return.sub,
    },
    {
      key: "net_profit",
      label: "Net profit",
      info: "Ending equity minus starting equity for the range, in USDT: realised and unrealised P&L after fees and slippage.",
      node: <AnimatedNumber value={m.net_profit} format={(n) => formatPnl(n)} />,
      tone: toneOf(m.net_profit),
      sub: `Fees paid ${formatUsd(m.total_fees)}`,
    },
    {
      key: "win_rate",
      label: "Win rate",
      info: "Winning trades ÷ all closed trades. Breakeven trades count as neither a win nor a loss but stay in the denominator.",
      node: isNum(wr) ? (
        <AnimatedNumber value={wr} format={(n) => formatPct(n, { decimals: 1 })} />
      ) : (
        <MetricValue display={{ text: "—", tone: "muted", reason: "No closed trades in this range yet." }} />
      ),
      tone: "neutral",
      sub: `${report.stats.winning_trades} W · ${report.stats.losing_trades} L`,
    },
    {
      key: "profit_factor",
      label: "Profit factor",
      info: items.profit_factor.info,
      node: <MetricValue display={items.profit_factor.display} />,
      tone: items.profit_factor.display.tone,
      sub: items.profit_factor.display.reason ? undefined : "gross profit ÷ gross loss",
    },
    {
      key: "max_drawdown",
      label: "Max drawdown",
      info: items.max_drawdown.info,
      node: <MetricValue display={items.max_drawdown.display} />,
      tone: items.max_drawdown.display.tone,
      sub: items.max_drawdown.sub,
    },
    {
      key: "sharpe",
      label: "Sharpe ratio",
      info: items.sharpe.info,
      node: <MetricValue display={items.sharpe.display} />,
      tone: items.sharpe.display.tone,
      sub: items.sharpe.display.reason ? "needs 5+ days" : "daily, annualised",
    },
  ];
}

function TileShell({
  label,
  info,
  children,
  sub,
  tone,
}: {
  label: string;
  info?: string;
  children: ReactNode;
  sub?: string;
  tone: Tone;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl surface-card p-3.5 sm:p-4">
      <div className="flex items-center gap-1">
        <span className="truncate label-caps">{label}</span>
        {info ? <InfoTooltip content={info} label={`About ${label}`} /> : null}
      </div>
      <div className={cn("truncate text-kpi font-semibold", TONE_TEXT[tone])}>{children}</div>
      <div className="min-h-4 truncate num text-xs text-fg-subtle">{sub}</div>
    </div>
  );
}

/** The six headline numbers above the charts. */
export function HeadlineStats({
  report,
  loading,
  className,
}: {
  report: PerformanceReport | undefined;
  loading?: boolean;
  className?: string;
}) {
  const grid = cn("grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6", className);
  if (loading || !report) {
    return (
      <div className={grid} aria-busy="true" aria-label="Loading headline statistics">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2.5 rounded-xl surface-card p-4" aria-hidden>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={grid}>
      {tiles(report).map((t) => (
        <TileShell key={t.key} label={t.label} info={t.info} sub={t.sub} tone={t.tone}>
          {t.node}
        </TileShell>
      ))}
    </div>
  );
}

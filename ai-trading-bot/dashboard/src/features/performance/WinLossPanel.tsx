import { cn } from "@/lib/cn";
import { formatInt, formatNumber, formatPct, isNum } from "@/lib/format";
import { TONE_BG, TONE_TEXT } from "@/lib/tones";
import type { PerformanceReport } from "@/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";
import { MetricGrid } from "./parts";
import { winLossItems, winLossSplit } from "./performance-logic";

/** Win / loss split bar + the six win/loss numbers + payoff ratio. */
export function WinLossPanel({
  report,
  loading,
}: {
  report: PerformanceReport | undefined;
  loading?: boolean;
}) {
  if (loading || !report) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading win and loss statistics">
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="grid grid-cols-3 gap-px">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-none" />
          ))}
        </div>
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (report.stats.total_trades === 0) {
    return (
      <EmptyState
        size="sm"
        title="No closed trades in this range yet"
        description="Win and loss statistics appear after the first trade closes."
      />
    );
  }
  const split = winLossSplit(report.stats);
  const payoff = report.win_loss.payoff_ratio;
  return (
    <div className="space-y-4">
      <div>
        <div
          role="img"
          aria-label={split
            .map((s) => `${s.count} ${s.label.toLowerCase()} (${formatNumber(s.pct, 0)}%)`)
            .join(", ")}
          className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
        >
          {split.map((s) => (
            <Tooltip
              key={s.key}
              content={`${s.label}: ${formatInt(s.count)} trades (${formatPct(s.pct, { decimals: 1 })})`}
            >
              <span
                tabIndex={0}
                className={cn("h-full first:rounded-l-full last:rounded-r-full", TONE_BG[s.tone])}
                style={{ width: `${s.pct}%` }}
              />
            </Tooltip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {split.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("size-2 rounded-[3px]", TONE_BG[s.tone])} />
              <span className="text-fg-muted">{s.label}</span>
              <span className="num text-fg">{formatInt(s.count)}</span>
            </span>
          ))}
        </div>
      </div>
      <MetricGrid items={winLossItems(report)} columns={3} />
      <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2/60 px-3 py-2 text-xs ring-1 ring-line-subtle ring-inset">
        <span className="inline-flex items-center gap-1 text-fg-muted">
          Payoff ratio
          <InfoTooltip content="Average win ÷ average loss. A payoff above 1 means winners are bigger than losers, so the bot can be profitable even with a win rate below 50 %." />
        </span>
        <span className="num text-dense">
          {isNum(payoff) ? (
            <>
              <span className={cn("font-semibold", payoff >= 1 ? TONE_TEXT.up : TONE_TEXT.down)}>
                {formatNumber(payoff, 2)}
              </span>
              <span className="text-fg-subtle"> · avg win is {formatNumber(payoff, 2)}× avg loss</span>
            </>
          ) : (
            <span className="text-fg-subtle">— needs a win and a loss</span>
          )}
        </span>
      </div>
    </div>
  );
}

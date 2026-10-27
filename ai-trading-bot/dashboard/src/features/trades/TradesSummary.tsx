import { cn } from "@/lib/cn";
import { formatInt, formatPct, formatUsd, formatPnl, toneOf } from "@/lib/format";
import { TONE_TEXT } from "@/lib/tones";
import { StatTile } from "@/features/positions/StatTile";
import type { TradeSummary } from "@/types";

/** Aggregates over the whole filtered set (not only the visible page). */
export function TradesSummary({ summary, loading }: { summary: TradeSummary | undefined; loading: boolean }) {
  const pnlTone = toneOf(summary?.net_pnl);
  const avgTone = toneOf(summary?.avg_pnl_pct);
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatTile
        label="Trades"
        info="Closed trades matching the current filters."
        loading={loading}
        value={formatInt(summary?.count)}
        sub="in this view"
      />
      <StatTile
        label="Wins / losses"
        info="Winning and losing trades in this view (breakevens are in neither count)."
        loading={loading}
        value={
          <span>
            <span className="text-up">{formatInt(summary?.wins)}</span>
            <span className="px-1 text-fg-subtle">/</span>
            <span className="text-down">{formatInt(summary?.losses)}</span>
          </span>
        }
        sub="W / L"
      />
      <StatTile
        label="Win rate"
        info="Winning trades as a share of all closed trades in this view."
        loading={loading}
        value={formatPct(summary?.win_rate, { decimals: 1 })}
        sub={summary?.count ? undefined : "No trades"}
      />
      <StatTile
        className="order-first col-span-2 md:order-none md:col-span-1"
        label="Net P&L"
        info="Total profit or loss of the trades in this view, after fees."
        loading={loading}
        value={<span className={TONE_TEXT[pnlTone]}>{formatPnl(summary?.net_pnl)}</span>}
        sub={`Gross ${summary ? formatPnl(summary.net_pnl + summary.fees) : "—"}`}
      />
      <StatTile
        label="Fees"
        info="Entry and exit fees paid across the trades in this view."
        loading={loading}
        value={formatUsd(summary?.fees)}
        sub="paid"
      />
      <StatTile
        label="Avg P&L %"
        info="Mean net return per trade, as a percentage of each trade's notional."
        loading={loading}
        value={
          <span className={cn(TONE_TEXT[avgTone])}>{formatPct(summary?.avg_pnl_pct, { signed: true })}</span>
        }
        sub="per trade"
      />
    </div>
  );
}

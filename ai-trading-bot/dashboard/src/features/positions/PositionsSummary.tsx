import { usePortfolio, usePositions } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { formatInt, formatPct, formatUsd, toneOf } from "@/lib/format";
import { TONE_TEXT } from "@/lib/tones";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { PnlFlash } from "./PositionCard";
import { StatTile } from "./StatTile";
import { positionTotals } from "./position-math";

/** Headline numbers for everything currently open (live: derived from the `positions` frames). */
export function PositionsSummary() {
  const positions = usePositions();
  const portfolio = usePortfolio();
  const loading = positions.isPending;
  const totals = positionTotals(positions.data ?? []);
  const equity = portfolio.data?.equity;
  const pctOfEquity = (n: number) => (equity ? (n / equity) * 100 : null);
  const exposurePct = pctOfEquity(totals.exposure);
  const pnlTone = toneOf(totals.unrealizedPnl);

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatTile
        className="order-first col-span-2 lg:order-none lg:col-span-1"
        label="Unrealized P&L"
        info="Combined mark-to-market profit or loss of all open positions, net of entry fees."
        loading={loading}
        value={<PnlFlash value={totals.unrealizedPnl} plain />}
        sub={
          <span className={cn("num", TONE_TEXT[pnlTone])}>
            {pctOfEquity(totals.unrealizedPnl) === null
              ? "—"
              : `${formatPct(pctOfEquity(totals.unrealizedPnl), { signed: true })} of equity`}
          </span>
        }
      />
      <StatTile
        label="Open positions"
        info="Positions currently open, split by direction."
        loading={loading}
        value={formatInt(totals.count)}
        sub={`${totals.longs} long · ${totals.shorts} short`}
      />
      <StatTile
        label="Exposure"
        info="Total notional of open positions at current prices, and its share of equity."
        loading={loading}
        value={formatUsd(totals.exposure, { compact: true })}
        sub={exposurePct === null ? "—" : `${formatPct(exposurePct, { decimals: 1 })} of equity`}
      />
      <StatTile
        label="Open risk"
        info="What the account loses if every open position hit its stop loss, and its share of equity."
        loading={loading}
        value={formatUsd(totals.openRisk)}
        sub={`${formatPct(totals.openRiskPct)} of equity`}
      />
      <StatTile
        label="Avg AI confidence"
        info="Mean AI confidence of the signals behind the open positions."
        loading={loading}
        value={<ConfidenceMeter value={totals.avgConfidence} variant="text" className="text-fg" />}
        sub={totals.avgConfidence === null ? "No positions" : "across open positions"}
      />
    </div>
  );
}

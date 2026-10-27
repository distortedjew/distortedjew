import { PieChart } from "lucide-react";
import { formatPct, formatUsd, isNum } from "@/lib/format";
import { usePositions } from "@/hooks/queries";
import type { Position, RiskSnapshot } from "@/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EnumBadge } from "@/components/ui/EnumBadge";
import { SymbolLabel } from "@/components/ui/SymbolLabel";
import { LiveTag } from "@/components/layout/LiveTag";

/** Exposure and risk per open position: notional, share of total exposure, and money at risk. */
export function ExposureBreakdownCard({ risk }: { risk: RiskSnapshot | undefined }) {
  const q = usePositions();
  const positions = q.data;
  const totalNotional = (positions ?? []).reduce((n, p) => n + p.notional, 0);
  const totalRisk = (positions ?? []).reduce((n, p) => n + p.risk_amount, 0);
  const equity = risk?.equity;

  const columns: Column<Position>[] = [
    {
      id: "symbol",
      header: "Symbol",
      mobile: "title",
      cell: (p) => <SymbolLabel symbol={p.symbol} />,
      sortValue: (p) => p.symbol,
    },
    {
      id: "side",
      header: "Side",
      mobile: "subtitle",
      cell: (p) => <EnumBadge kind="side" value={p.side} size="xs" />,
      sortValue: (p) => p.side,
    },
    {
      id: "notional",
      header: "Notional",
      align: "right",
      mobile: "value",
      info: "Entry value of the position in USDT.",
      cell: (p) => <span className="num">{formatUsd(p.notional)}</span>,
      sortValue: (p) => p.notional,
    },
    {
      id: "share",
      header: "Share of exposure",
      mobile: "detail",
      hideBelow: "md",
      cell: (p) => {
        const share = totalNotional > 0 ? (p.notional / totalNotional) * 100 : 0;
        return (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="h-1.5 w-20 overflow-hidden rounded-full bg-accent/15">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
            </span>
            <span className="w-10 text-right num text-fg-muted">{formatPct(share, { decimals: 0 })}</span>
          </span>
        );
      },
      sortValue: (p) => p.notional,
    },
    {
      id: "equity_pct",
      header: "% of equity",
      align: "right",
      mobile: "detail",
      cell: (p) => (
        <span className="num">
          {isNum(equity) && equity > 0 ? formatPct((p.notional / equity) * 100, { decimals: 1 }) : "—"}
        </span>
      ),
      sortValue: (p) => p.notional,
    },
    {
      id: "risk",
      header: "At risk",
      align: "right",
      mobile: "detail",
      info: "Money lost if the stop-loss is hit.",
      cell: (p) => (
        <span className="num">
          {formatUsd(p.risk_amount)}{" "}
          <span className="text-fg-subtle">({formatPct(p.risk_pct, { decimals: 2 })})</span>
        </span>
      ),
      sortValue: (p) => p.risk_amount,
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Exposure by position"
        icon={PieChart}
        badge={<LiveTag />}
        subtitle={
          positions
            ? `${positions.length} open · ${formatUsd(totalNotional)} notional · ${formatUsd(totalRisk)} at risk`
            : undefined
        }
      />
      <DataTable
        columns={columns}
        data={positions}
        rowKey={(p) => p.id}
        loading={q.isPending}
        error={q.error && !positions ? q.error : undefined}
        onRetry={() => void q.refetch()}
        density="compact"
        empty={{
          title: "No open positions — exposure is zero",
          description:
            "The bot opens a position when a signal passes every risk check; its exposure and risk then show up here.",
        }}
      />
    </Card>
  );
}

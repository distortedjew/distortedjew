import { Layers, LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatInt, formatPct } from "@/lib/format";
import { TONE_BG } from "@/lib/tones";
import type { ExitReasonBreakdown, PerformanceReport, SymbolBreakdown } from "@/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EnumBadge } from "@/components/ui/EnumBadge";
import { PnlText } from "@/components/ui/PnlText";
import { SymbolLabel } from "@/components/ui/SymbolLabel";

const symbolColumns: Column<SymbolBreakdown>[] = [
  {
    id: "symbol",
    header: "Symbol",
    mobile: "title",
    cell: (s) => <SymbolLabel symbol={s.symbol} />,
    sortValue: (s) => s.symbol,
  },
  {
    id: "trades",
    header: "Trades",
    align: "right",
    mobile: "detail",
    cell: (s) => <span className="num">{formatInt(s.trades)}</span>,
    sortValue: (s) => s.trades,
  },
  {
    id: "win_rate",
    header: "Win rate",
    align: "right",
    mobile: "detail",
    info: "Winning trades ÷ closed trades for this symbol.",
    cell: (s) => <span className="num">{formatPct(s.win_rate, { decimals: 0 })}</span>,
    sortValue: (s) => s.win_rate,
  },
  {
    id: "pnl",
    header: "Net P&L",
    align: "right",
    mobile: "value",
    cell: (s) => <PnlText value={s.pnl} />,
    sortValue: (s) => s.pnl,
  },
];

/** P&L per symbol. */
export function SymbolBreakdownCard({ report, loading, fetching, error, onRetry }: BreakdownProps) {
  return (
    <Card>
      <CardHeader
        title="By symbol"
        icon={Layers}
        subtitle="Net P&L and win rate per trading pair"
        info="Closed trades grouped by trading pair. Net P&L is after fees."
      />
      <DataTable
        columns={symbolColumns}
        data={report?.by_symbol}
        loading={loading}
        fetching={fetching}
        error={error}
        onRetry={onRetry}
        rowKey={(s) => s.symbol}
        density="compact"
        defaultSort={{ id: "pnl", desc: true }}
        empty={{
          title: "No closed trades in this range yet",
          description: "Per-symbol results appear after the first trade closes.",
        }}
      />
    </Card>
  );
}

/** P&L per exit reason, with each reason's share of trades. */
export function ExitReasonBreakdownCard({ report, loading, fetching, error, onRetry }: BreakdownProps) {
  const total = (report?.by_exit_reason ?? []).reduce((n, r) => n + r.count, 0);
  const columns: Column<ExitReasonBreakdown>[] = [
    {
      id: "reason",
      header: "Exit reason",
      mobile: "title",
      cell: (r) => <EnumBadge kind="exitReason" value={r.reason} size="xs" describe />,
      sortValue: (r) => r.reason,
    },
    {
      id: "count",
      header: "Trades",
      align: "right",
      mobile: "detail",
      cell: (r) => (
        <span className="inline-flex items-center justify-end gap-2">
          <span aria-hidden className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-fg/10 sm:block">
            <span
              className={cn("block h-full rounded-full", TONE_BG.neutral)}
              style={{ width: `${total ? (r.count / total) * 100 : 0}%` }}
            />
          </span>
          <span className="num">
            {formatInt(r.count)}
            <span className="text-fg-subtle">
              {" "}
              · {formatPct(total ? (r.count / total) * 100 : 0, { decimals: 0 })}
            </span>
          </span>
        </span>
      ),
      sortValue: (r) => r.count,
    },
    {
      id: "pnl",
      header: "Net P&L",
      align: "right",
      mobile: "value",
      cell: (r) => <PnlText value={r.pnl} />,
      sortValue: (r) => r.pnl,
    },
  ];
  return (
    <Card>
      <CardHeader
        title="By exit reason"
        icon={LogOut}
        subtitle="How trades ended and what each exit earned"
        info="Closed trades grouped by why they ended: stop loss, take profit, signal reversal, time exit or the daily-loss kill switch."
      />
      <DataTable
        columns={columns}
        data={report?.by_exit_reason}
        loading={loading}
        fetching={fetching}
        error={error}
        onRetry={onRetry}
        rowKey={(r) => r.reason}
        density="compact"
        defaultSort={{ id: "count", desc: true }}
        empty={{
          title: "No closed trades in this range yet",
          description: "Exit reasons appear after the first trade closes.",
        }}
      />
    </Card>
  );
}

interface BreakdownProps {
  report: PerformanceReport | undefined;
  loading?: boolean;
  fetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
}

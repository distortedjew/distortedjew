import { ArrowLeftRight } from "lucide-react";
import { formatDuration, formatPrice, formatSize, formatUsd, splitSymbol } from "@/lib/format";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { DataTable, type Column, type SortState } from "@/components/ui/DataTable";
import { EnumBadge } from "@/components/ui/EnumBadge";
import { PnlText } from "@/components/ui/PnlText";
import { SymbolLabel } from "@/components/ui/SymbolLabel";
import { Timestamp } from "@/components/ui/Timestamp";
import { Tooltip } from "@/components/ui/Tooltip";
import { EXIT_REASON_META } from "@/lib/constants";
import type { Trade } from "@/types";

/** Exit-reason badge; the tooltip carries what the exit means and why the trade was entered. */
export function ReasonBadge({ trade }: { trade: Pick<Trade, "exit_reason" | "entry_reason"> }) {
  const meta = EXIT_REASON_META[trade.exit_reason];
  return (
    <Tooltip
      content={
        <span className="block max-w-64 text-[11px] leading-4">
          <span className="block font-medium text-fg">
            {meta.label}
            {meta.description ? (
              <span className="font-normal text-fg-muted"> — {meta.description}</span>
            ) : null}
          </span>
          {trade.entry_reason ? (
            <span className="mt-1 block text-fg-subtle">Entry reason: {trade.entry_reason}</span>
          ) : null}
        </span>
      }
    >
      <span tabIndex={0} className="inline-flex rounded-md">
        <EnumBadge kind="exitReason" value={trade.exit_reason} short size="xs" />
      </span>
    </Tooltip>
  );
}

const COLUMNS: Column<Trade>[] = [
  {
    id: "time",
    header: "Time",
    mobile: "subtitle",
    sortable: true,
    info: "When the trade closed, in your local time (UTC on hover).",
    cell: (t) => <Timestamp value={t.closed_at} mode="datetime" seconds={false} className="text-fg-muted" />,
  },
  {
    id: "symbol",
    header: "Symbol",
    mobile: "title",
    sortable: true,
    sortDescFirst: false,
    cell: (t) => <SymbolLabel symbol={t.symbol} />,
  },
  {
    id: "side",
    header: "Side",
    mobile: "subtitle",
    sortable: true,
    sortDescFirst: false,
    cell: (t) => <EnumBadge kind="side" value={t.side} size="xs" />,
  },
  {
    id: "entry",
    header: "Entry",
    align: "right",
    mobile: "detail",
    cell: (t) => <span className="num">{formatPrice(t.entry_price)}</span>,
  },
  {
    id: "exit",
    header: "Exit",
    align: "right",
    mobile: "detail",
    cell: (t) => <span className="num">{formatPrice(t.exit_price)}</span>,
  },
  {
    id: "size",
    header: "Size",
    align: "right",
    hideBelow: "lg",
    cell: (t) => <span className="num">{formatSize(t.size, splitSymbol(t.symbol).base)}</span>,
  },
  {
    id: "pnl",
    header: "P&L",
    align: "right",
    mobile: "value",
    sortable: true,
    info: "Net profit or loss after all fees.",
    cell: (t) => <PnlText value={t.pnl} className="font-medium" />,
  },
  {
    id: "pnl_pct",
    header: "P&L %",
    align: "right",
    mobile: "meta",
    sortable: true,
    info: "Net P&L as a percentage of the trade's entry notional.",
    cell: (t) => <PnlText value={t.pnl} pct={t.pnl_pct} pctOnly />,
  },
  {
    id: "fees",
    header: "Fees",
    align: "right",
    hideBelow: "xl",
    mobile: "detail",
    info: "Entry plus exit fees paid.",
    cell: (t) => <span className="num text-fg-muted">{formatUsd(t.fees)}</span>,
  },
  {
    id: "duration",
    header: "Duration",
    align: "right",
    hideBelow: "lg",
    mobile: "detail",
    sortable: true,
    cell: (t) => <span className="num text-fg-muted">{formatDuration(t.duration_sec)}</span>,
  },
  {
    id: "confidence",
    header: "AI conf.",
    align: "right",
    hideBelow: "md",
    mobile: "detail",
    mobileLabel: "AI confidence",
    sortable: true,
    info: "The AI analyst's confidence in the signal that opened this trade.",
    cell: (t) => <ConfidenceMeter value={t.ai_confidence} />,
  },
  {
    id: "reason",
    header: "Reason",
    align: "right",
    mobile: "detail",
    mobileLabel: "Exit",
    sortable: true,
    sortDescFirst: false,
    info: "Why the trade was closed. Hover the badge for the reason it was entered.",
    cell: (t) => <ReasonBadge trade={t} />,
  },
];

interface Props {
  trades: Trade[] | undefined;
  loading: boolean;
  fetching: boolean;
  error: unknown;
  onRetry: () => void;
  sort: SortState | null;
  onSortChange: (sort: SortState | null) => void;
  onOpen: (id: string) => void;
  selectedId: string | null;
  filtered: boolean;
  onClearFilters: () => void;
}

export function TradesTable({
  trades,
  loading,
  fetching,
  error,
  onRetry,
  sort,
  onSortChange,
  onOpen,
  selectedId,
  filtered,
  onClearFilters,
}: Props) {
  return (
    <DataTable
      columns={COLUMNS}
      data={trades}
      rowKey={(t) => t.id}
      loading={loading}
      fetching={fetching}
      error={error}
      onRetry={onRetry}
      sort={sort}
      onSortChange={onSortChange}
      onRowClick={(t) => onOpen(t.id)}
      isRowSelected={(t) => t.id === selectedId}
      skeletonRows={8}
      caption="Closed trades"
      empty={
        filtered
          ? {
              icon: ArrowLeftRight,
              title: "No trades match these filters",
              description: "Widen the date range or clear a filter to see more.",
              action: (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="text-dense text-accent underline-offset-4 hover:underline"
                >
                  Clear filters
                </button>
              ),
            }
          : {
              icon: ArrowLeftRight,
              title: "No closed trades yet",
              description: "Trades appear here as soon as the bot closes its first position.",
            }
      }
    />
  );
}

import { Layers } from "lucide-react";
import { Link } from "react-router";
import { useBreakpoint } from "@/hooks/use-media-query";
import { formatPct, formatPrice, formatR, formatSize, formatUsd, splitSymbol } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { EnumBadge } from "@/components/ui/EnumBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { SymbolLabel } from "@/components/ui/SymbolLabel";
import type { Position } from "@/types";
import { LiveDuration, PnlFlash, PositionCard, PriceFlash } from "./PositionCard";
import { SltpProgress } from "./SltpProgress";

const OPEN_POSITIONS_EMPTY = {
  icon: Layers,
  title: "No open positions",
  description: "The bot is waiting for a signal that passes every risk check.",
} as const;

export function NoPositions({ className }: { className?: string }) {
  return (
    <EmptyState
      className={className}
      icon={OPEN_POSITIONS_EMPTY.icon}
      title={OPEN_POSITIONS_EMPTY.title}
      description={`${OPEN_POSITIONS_EMPTY.description} Every decision, and why it was taken or skipped, is in the AI decision log.`}
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/ai">Open the AI decision log</Link>
        </Button>
      }
    />
  );
}

const sub = "num text-[11px] leading-4 text-fg-subtle";

function buildColumns(): Column<Position>[] {
  return [
    {
      id: "symbol",
      header: "Symbol",
      cell: (p) => <SymbolLabel symbol={p.symbol} />,
      sortValue: (p) => p.symbol,
      sortDescFirst: false,
    },
    {
      id: "side",
      header: "Side",
      cell: (p) => <EnumBadge kind="side" value={p.side} size="xs" />,
      sortValue: (p) => p.side,
      sortDescFirst: false,
    },
    {
      id: "size",
      header: "Size",
      align: "right",
      hideBelow: "lg",
      info: "Position size in base units, with its notional value at entry underneath.",
      cell: (p) => (
        <div>
          <div className="num whitespace-nowrap">{formatSize(p.size, splitSymbol(p.symbol).base)}</div>
          <div className={sub}>{formatUsd(p.notional, { compact: true })}</div>
        </div>
      ),
      sortValue: (p) => p.notional,
    },
    {
      id: "entry",
      header: "Entry",
      align: "right",
      cell: (p) => <span className="num">{formatPrice(p.entry_price)}</span>,
      sortValue: (p) => p.entry_price,
    },
    {
      id: "current",
      header: "Current",
      align: "right",
      cell: (p) => <PriceFlash value={p.current_price} />,
      sortValue: (p) => p.current_price,
    },
    {
      id: "stop",
      header: "Stop loss",
      align: "right",
      hideBelow: "md",
      info: "Price at which the engine closes the position at a loss. The line underneath is the distance from the current price.",
      cell: (p) => (
        <div>
          <div className="num">{formatPrice(p.stop_loss)}</div>
          <div className={sub}>−{formatPct(p.distance_to_sl_pct)}</div>
        </div>
      ),
      sortValue: (p) => p.distance_to_sl_pct,
    },
    {
      id: "target",
      header: "Take profit",
      align: "right",
      hideBelow: "md",
      info: "Price at which the engine takes profit. The line underneath is the distance from the current price.",
      cell: (p) => (
        <div>
          <div className="num">{formatPrice(p.take_profit)}</div>
          <div className={sub}>+{formatPct(p.distance_to_tp_pct)}</div>
        </div>
      ),
      sortValue: (p) => p.distance_to_tp_pct,
    },
    {
      id: "range",
      header: "SL ▸ TP",
      width: 128,
      hideBelow: "xl",
      info: "Where price sits between the stop (left) and the target (right). The tick is the entry; the filled stretch runs from entry to now.",
      cell: (p) => <SltpProgress position={p} className="w-28" />,
    },
    {
      id: "pnl",
      header: "Unrealized P&L",
      align: "right",
      info: "Mark-to-market profit or loss, net of the entry fee already paid. The line underneath is the R multiple (P&L ÷ amount risked).",
      cell: (p) => (
        <div>
          <div className="font-medium">
            <PnlFlash value={p.unrealized_pnl} />
          </div>
          <div className={sub}>{formatR(p.r_multiple, 2)}</div>
        </div>
      ),
      sortValue: (p) => p.unrealized_pnl,
    },
    {
      id: "pnl_pct",
      header: "P&L %",
      align: "right",
      info: "Unrealized P&L as a percentage of the position's entry notional.",
      cell: (p) => <PnlFlash value={p.unrealized_pnl_pct} pct />,
      sortValue: (p) => p.unrealized_pnl_pct,
    },
    {
      id: "duration",
      header: "Duration",
      align: "right",
      hideBelow: "lg",
      cell: (p) => (
        <span className="num text-fg-muted">
          <LiveDuration position={p} />
        </span>
      ),
      sortValue: (p) => Date.parse(p.opened_at),
      sortDescFirst: false,
    },
    {
      id: "confidence",
      header: "AI confidence",
      align: "right",
      hideBelow: "md",
      info: "The AI analyst's confidence in the signal that opened this position.",
      cell: (p) => <ConfidenceMeter value={p.ai_confidence} />,
      sortValue: (p) => p.ai_confidence,
    },
  ];
}

const COLUMNS = buildColumns();

interface PositionsListProps {
  positions: Position[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

/** The positions table on desktop / tablet landscape, stacked cards below `md`. */
export function PositionsList({
  positions,
  loading,
  error,
  onRetry,
  selectedId,
  onOpen,
}: PositionsListProps) {
  const wide = useBreakpoint("md");

  if (!wide) {
    if (loading && !positions) {
      return (
        <ul className="divide-y divide-line-subtle" aria-hidden>
          {[0, 1].map((i) => (
            <li key={i} className="space-y-3 px-4 py-3.5">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </li>
          ))}
        </ul>
      );
    }
    if (error && !positions?.length) return <ErrorState error={error} onRetry={onRetry} className="py-8" />;
    if (!positions?.length) return <NoPositions />;
    return (
      <ul className="divide-y divide-line-subtle">
        {positions.map((p) => (
          <li key={p.id}>
            <PositionCard position={p} onOpen={onOpen} selected={selectedId === p.id} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <DataTable
      columns={COLUMNS}
      data={positions}
      rowKey={(p) => p.id}
      loading={loading}
      error={error}
      onRetry={onRetry}
      onRowClick={(p) => onOpen(p.id)}
      isRowSelected={(p) => p.id === selectedId}
      density="comfortable"
      mobileBreakpoint={false}
      defaultSort={{ id: "pnl", desc: true }}
      skeletonRows={3}
      animateRows
      caption="Open positions"
      empty={<NoPositions />}
    />
  );
}

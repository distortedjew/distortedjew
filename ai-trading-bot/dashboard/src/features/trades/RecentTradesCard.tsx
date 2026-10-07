import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { LiveTag } from "@/components/layout/LiveTag";
import { useTrades } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { EnumBadge } from "@/components/ui/EnumBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { PnlText } from "@/components/ui/PnlText";
import { RelativeTime } from "@/components/ui/Timestamp";
import { Skeleton } from "@/components/ui/Skeleton";
import { SymbolLabel } from "@/components/ui/SymbolLabel";
import { ArrowLeftRight } from "lucide-react";
import { TradeDrawerHost } from "./TradeDrawer";

const RECENT = { limit: 6, sort: "closed_at", order: "desc" } as const;

/** Overview widget: the last few closed trades; a click opens the trade drawer (`?trade=<id>`). */
export function RecentTradesCard({ className }: { className?: string }) {
  const q = useTrades(RECENT);
  const [selected, setSelected] = useUrlState<string>("trade", "");
  const items = q.data?.items;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title="Recent trades"
        badge={<LiveTag />}
        actions={
          <Button asChild variant="ghost" size="xs" rightIcon={ArrowRight}>
            <Link to="/trades">All</Link>
          </Button>
        }
      />
      {q.isPending ? (
        <div className="space-y-3 px-4 pb-4" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : q.error && !items ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
      ) : !items?.length ? (
        <EmptyState
          size="sm"
          icon={ArrowLeftRight}
          title="No closed trades yet"
          description="Closed trades appear here the moment the bot exits a position."
        />
      ) : (
        <ul className="divide-y divide-line-subtle border-t border-line-subtle">
          {items.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setSelected(t.id)}
                aria-pressed={selected === t.id}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors outline-none hover:bg-fg/[0.025] focus-visible:bg-fg/[0.04]"
              >
                <span className="min-w-0 space-y-0.5">
                  <span className="flex items-center gap-2">
                    <SymbolLabel symbol={t.symbol} size="sm" />
                    <EnumBadge kind="side" value={t.side} size="xs" />
                  </span>
                  <span className="block num text-xs text-fg-subtle">
                    <RelativeTime ms={Date.parse(t.closed_at)} /> · {formatDuration(t.duration_sec)}
                  </span>
                </span>
                <span className="shrink-0 space-y-0.5 text-right">
                  <span className="block text-dense font-medium">
                    <PnlText value={t.pnl} />
                  </span>
                  <span className="block text-xs">
                    <PnlText value={t.pnl} pct={t.pnl_pct} pctOnly />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <TradeDrawerHost />
    </Card>
  );
}

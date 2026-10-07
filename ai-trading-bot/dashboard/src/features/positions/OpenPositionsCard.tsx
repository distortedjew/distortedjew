import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { LiveTag } from "@/components/layout/LiveTag";
import { usePositions } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { formatInt, formatPnl, toneOf } from "@/lib/format";
import { TONE_TEXT } from "@/lib/tones";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { PositionCard } from "./PositionCard";
import { PositionDrawerHost } from "./PositionDrawer";
import { NoPositions } from "./PositionsTable";
import { positionTotals } from "./position-math";

/**
 * Overview widget: the live open positions as compact cards (symbol, side, P&L, stop → target).
 * Clicking one opens the same drawer as the Positions page (`?position=<id>`).
 */
export function OpenPositionsCard({ className }: { className?: string }) {
  const positions = usePositions();
  const [selected, setSelected] = useUrlState<string>("position", "");
  const items = positions.data;
  const totals = positionTotals(items ?? []);

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title="Open positions"
        badge={<LiveTag />}
        subtitle={
          items?.length ? (
            <span className="num">
              {formatInt(items.length)} open ·{" "}
              <span className={TONE_TEXT[toneOf(totals.unrealizedPnl)]}>
                {formatPnl(totals.unrealizedPnl)}
              </span>
            </span>
          ) : undefined
        }
        actions={
          <Button asChild variant="ghost" size="xs" rightIcon={ArrowRight}>
            <Link to="/positions">All</Link>
          </Button>
        }
      />
      {positions.isPending ? (
        <div className="space-y-3 px-4 pb-4" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2.5">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      ) : positions.error && !items ? (
        <ErrorState error={positions.error} onRetry={() => void positions.refetch()} compact />
      ) : !items?.length ? (
        <NoPositions className="py-8" />
      ) : (
        <ul className="divide-y divide-line-subtle border-t border-line-subtle">
          {items.map((p) => (
            <li key={p.id}>
              <PositionCard position={p} onOpen={setSelected} selected={selected === p.id} compact />
            </li>
          ))}
        </ul>
      )}
      <PositionDrawerHost />
    </Card>
  );
}

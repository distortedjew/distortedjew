import { Link } from "react-router";
import { TrendingUp } from "lucide-react";
import { usePerformance } from "@/hooks/queries";
import { formatPct, formatPnl, toneOf } from "@/lib/format";
import { cn } from "@/lib/cn";
import { TONE_TEXT } from "@/lib/tones";
import { Sparkline } from "@/components/charts/Sparkline";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { thinRows } from "./performance-logic";

/** Compact 7-day equity card for the Overview: return, net P&L and an equity sparkline. */
export function EquityMiniCard({ className }: { className?: string }) {
  const q = usePerformance("7d");
  const report = q.data;
  const curve = report ? thinRows(report.equity_curve, 80) : [];
  const tone = toneOf(report?.metrics.total_return_pct);
  return (
    <Card className={className}>
      <CardHeader
        title="Equity, 7 days"
        icon={TrendingUp}
        actions={
          <Button asChild variant="link" size="xs" className="text-xs">
            <Link to="/performance">Performance</Link>
          </Button>
        }
      />
      <CardBody>
        {q.isPending ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : q.error && !report ? (
          <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
        ) : report && curve.length > 1 ? (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className={cn("text-kpi font-semibold", TONE_TEXT[tone])}>
                {formatPct(report.metrics.total_return_pct, { signed: true })}
              </span>
              <span className={cn("num text-dense", TONE_TEXT[tone])}>
                {formatPnl(report.metrics.net_profit)}
              </span>
            </div>
            <Sparkline
              data={curve.map((p) => p.equity)}
              height={56}
              tone="auto"
              aria-label="Equity over the last 7 days"
            />
          </div>
        ) : (
          <p className="py-4 text-center text-dense text-fg-subtle">No equity history yet.</p>
        )}
      </CardBody>
    </Card>
  );
}

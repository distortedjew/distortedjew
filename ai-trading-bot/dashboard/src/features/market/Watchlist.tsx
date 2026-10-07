import { ListOrdered } from "lucide-react";
import { Sparkline } from "@/components/charts/Sparkline";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PriceText } from "@/components/ui/PriceText";
import { Skeleton } from "@/components/ui/Skeleton";
import { SymbolLabel } from "@/components/ui/SymbolLabel";
import { LiveTag } from "@/components/layout/LiveTag";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { ChangeText } from "./MarketHeader";
import { useWatchlistTickers } from "./use-watchlist-tickers";

/**
 * The engine's symbols with live price, 24h change and a 24h sparkline. Vertical list on desktop,
 * a horizontal strip of compact tiles on phones / tablets (`layout="strip"`).
 */
export function Watchlist({
  selected,
  onSelect,
  layout = "list",
  className,
}: {
  selected: string;
  onSelect: (symbol: string) => void;
  layout?: "list" | "strip";
  className?: string;
}) {
  const { tickers, isPending, error, refetch } = useWatchlistTickers();

  if (layout === "strip") {
    return (
      <div
        className={cn("-mx-1 scrollbar-none flex gap-2 overflow-x-auto px-1 pb-0.5", className)}
        role="radiogroup"
        aria-label="Watchlist"
      >
        {isPending
          ? Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-[58px] w-40 shrink-0 rounded-xl" />
            ))
          : tickers.map((t) => (
              <button
                key={t.symbol}
                type="button"
                role="radio"
                aria-checked={t.symbol === selected}
                onClick={() => onSelect(t.symbol)}
                className={cn(
                  "flex w-40 shrink-0 flex-col gap-0.5 rounded-xl px-3 py-2 text-left ring-1 transition-colors ring-inset",
                  "focus-visible:outline-2 focus-visible:outline-accent/70",
                  t.symbol === selected ? "bg-accent/10 ring-accent/40" : "surface-card ring-line",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <SymbolLabel symbol={t.symbol} size="sm" quote={false} />
                  <ChangeText pct={t.change_24h_pct} className="text-2xs" />
                </span>
                <PriceText value={t.price} className="text-dense text-fg" />
              </button>
            ))}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader
        title="Watchlist"
        icon={ListOrdered}
        badge={<LiveTag />}
        subtitle="24h change · hourly closes"
      />
      {error && !tickers.length ? (
        <div className="px-4 pb-4">
          <ErrorState error={error} onRetry={refetch} compact />
        </div>
      ) : isPending ? (
        <div className="space-y-2 px-4 pb-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : !tickers.length ? (
        <EmptyState
          size="sm"
          title="No symbols yet"
          description="Tickers appear once the engine publishes market data."
        />
      ) : (
        <ul className="px-2 pb-2" role="radiogroup" aria-label="Watchlist">
          {tickers.map((t) => {
            const active = t.symbol === selected;
            return (
              <li key={t.symbol}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onSelect(t.symbol)}
                  className={cn(
                    "relative grid w-full grid-cols-[minmax(0,1fr)_64px_auto] items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-accent/70",
                    active ? "bg-accent/10" : "hover:bg-fg/[0.04]",
                  )}
                >
                  {active ? (
                    <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
                  ) : null}
                  <SymbolLabel symbol={t.symbol} />
                  <Sparkline
                    data={t.sparkline}
                    height={26}
                    endDot={false}
                    strokeWidth={1.5}
                    aria-label={`${t.symbol} 24h trend`}
                  />
                  <span className="flex flex-col items-end">
                    <PriceText
                      value={t.price}
                      format={(v) => formatPrice(v)}
                      className="text-dense text-fg"
                    />
                    <ChangeText pct={t.change_24h_pct} className="text-2xs" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

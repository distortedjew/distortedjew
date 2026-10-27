import { useSymbols, useWatchlist } from "@/hooks/queries";
import { useTickers } from "@/hooks/live";
import type { Ticker } from "@/types";

/** Watchlist tickers in engine symbol order, each the freshest of WS and REST. */
export function useWatchlistTickers(): {
  tickers: Ticker[];
  isPending: boolean;
  error: unknown;
  refetch: () => void;
} {
  const q = useWatchlist();
  const live = useTickers();
  const { symbols } = useSymbols();
  const rest = q.data ?? [];
  const order = symbols.length ? symbols : rest.map((t) => t.symbol);
  const tickers = order.flatMap((symbol) => {
    const r = rest.find((t) => t.symbol === symbol);
    const l = live[symbol];
    const pick =
      l && (!r || Date.parse(l.ts) >= Date.parse(r.ts))
        ? { ...l, sparkline: l.sparkline.length ? l.sparkline : (r?.sparkline ?? []) }
        : r;
    return pick ? [pick] : [];
  });
  return {
    tickers,
    isPending: q.isPending && tickers.length === 0,
    error: q.error,
    refetch: () => void q.refetch(),
  };
}

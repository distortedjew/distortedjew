import { Link } from "react-router";
import { useSymbols } from "@/hooks/queries";
import { useTicker } from "@/hooks/live";
import { cn } from "@/lib/cn";
import { formatPct, splitSymbol, toneOf } from "@/lib/format";
import { TONE_TEXT } from "@/lib/tones";
import { PriceText } from "@/components/ui/PriceText";

function TickerChip({ symbol }: { symbol: string }) {
  const ticker = useTicker(symbol);
  const { base } = splitSymbol(symbol);
  const tone = toneOf(ticker?.change_24h_pct);
  return (
    <Link
      to={`/markets?symbol=${encodeURIComponent(symbol)}`}
      className="group inline-flex h-7 items-center gap-2 rounded-md px-2 text-xs whitespace-nowrap transition-colors hover:bg-fg/[0.05]"
    >
      <span className="font-semibold tracking-[0.04em] text-fg-muted group-hover:text-fg">{base}</span>
      <PriceText value={ticker?.price} className="text-fg" />
      <span className={cn("num text-[11px]", TONE_TEXT[tone])}>
        {formatPct(ticker?.change_24h_pct, { signed: true })}
      </span>
    </Link>
  );
}

/** Live mini tickers for the traded symbols (wide screens, in the nav row). */
export function TickerStrip({ className }: { className?: string }) {
  const { symbols } = useSymbols();
  if (symbols.length === 0) return null;
  return (
    <div className={cn("flex items-center gap-0.5", className)} aria-label="Live prices">
      {symbols.slice(0, 4).map((symbol) => (
        <TickerChip key={symbol} symbol={symbol} />
      ))}
    </div>
  );
}

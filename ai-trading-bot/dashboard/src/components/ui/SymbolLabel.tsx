import { cn } from "@/lib/cn";
import { splitSymbol } from "@/lib/format";

/**
 * A trading pair, rendered the same everywhere: base asset emphasized, quote muted, with a small
 * monogram. "BTC/USDT" → [B] BTC/USDT.
 *
 *   <SymbolLabel symbol={position.symbol} />                  // tables, cards
 *   <SymbolLabel symbol={symbol} size="lg" />                 // page / drawer headings
 *   <SymbolLabel symbol={symbol} monogram={false} quote={false} />  // "BTC" only
 */
export function SymbolLabel({
  symbol,
  size = "md",
  monogram = true,
  quote = true,
  className,
}: {
  symbol: string;
  size?: "sm" | "md" | "lg";
  /** Show the round initial before the name (default true). */
  monogram?: boolean;
  /** Show "/USDT" (default true). */
  quote?: boolean;
  className?: string;
}) {
  const { base, quote: quoteAsset } = splitSymbol(symbol);
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center whitespace-nowrap",
        size === "lg" ? "gap-2.5 text-base" : size === "sm" ? "gap-1.5 text-xs" : "gap-2 text-dense",
        className,
      )}
    >
      {monogram ? (
        <span
          aria-hidden
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full bg-fg/[0.07] font-semibold text-fg-muted ring-1 ring-line ring-inset",
            size === "lg" ? "size-7 text-[10px]" : size === "sm" ? "size-4 text-[9px]" : "size-5 text-[10px]",
          )}
        >
          {base.slice(0, size === "lg" ? 3 : 1)}
        </span>
      ) : null}
      <span className="truncate">
        <span className="font-semibold tracking-[0.01em] text-fg">{base}</span>
        {quote && quoteAsset ? <span className="text-fg-subtle">/{quoteAsset}</span> : null}
      </span>
    </span>
  );
}

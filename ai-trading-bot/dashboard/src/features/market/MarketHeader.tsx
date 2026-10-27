import { EnumBadge } from "@/components/ui/EnumBadge";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { PriceText } from "@/components/ui/PriceText";
import { Skeleton } from "@/components/ui/Skeleton";
import { SymbolLabel } from "@/components/ui/SymbolLabel";
import { Tooltip } from "@/components/ui/Tooltip";
import { useStatus } from "@/hooks/queries";
import { useTicker } from "@/hooks/live";
import { cn } from "@/lib/cn";
import {
  formatCompact,
  formatPnl,
  formatPrice,
  formatSignedPct,
  isNum,
  signOf,
  splitSymbol,
} from "@/lib/format";
import type { FeedKind } from "@/types";

/** ▲ +1.24% colored by direction (sign + arrow, never color alone). */
export function ChangeText({ pct, className }: { pct: number | null | undefined; className?: string }) {
  const s = signOf(pct);
  return (
    <span
      className={cn(
        "num font-medium whitespace-nowrap",
        s > 0 ? "text-up" : s < 0 ? "text-down" : "text-fg-muted",
        className,
      )}
    >
      {s > 0 ? "▲ " : s < 0 ? "▼ " : ""}
      {formatSignedPct(pct)}
    </span>
  );
}

export function FeedBadge({ feed: feedProp }: { feed?: FeedKind }) {
  const status = useStatus();
  const engine = status.data?.engine;
  const feed = feedProp ?? engine?.feed;
  if (!feed) return null;
  const message =
    engine?.feed_message ?? (feed === "simulated" ? "Simulated market data" : "Binance market data");
  return (
    <Tooltip content={`${message}${engine && !engine.feed_connected ? " — feed disconnected" : ""}`}>
      <span tabIndex={0} className="inline-flex rounded-md">
        <EnumBadge kind="feed" value={feed} caps size="sm" />
      </span>
    </Tooltip>
  );
}

/** The large "BTC/USDT  $97,412.50  ▲ +1.24%" market header with 24h stats and the feed badge. */
export function MarketHeader({
  symbol,
  feed,
  className,
}: {
  symbol: string;
  feed?: FeedKind;
  className?: string;
}) {
  const ticker = useTicker(symbol);
  const { base } = splitSymbol(symbol);
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <SymbolLabel symbol={symbol} size="lg" />
          <FeedBadge feed={feed} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {ticker ? (
            <>
              <PriceText
                value={ticker.price}
                format={(v) => formatPrice(v, { currency: true })}
                className="text-[28px] leading-9 font-semibold tracking-[-0.02em] text-fg sm:text-[32px]"
              />
              <ChangeText pct={ticker.change_24h_pct} className="text-base" />
              <span className="num text-xs text-fg-subtle">{formatPnl(ticker.change_24h)} 24h</span>
            </>
          ) : (
            <Skeleton className="h-9 w-64" />
          )}
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-xs">
        <Stat label="24h high" value={ticker ? formatPrice(ticker.high_24h) : undefined} />
        <Stat label="24h low" value={ticker ? formatPrice(ticker.low_24h) : undefined} />
        <Stat
          label="24h volume"
          info={`Traded volume over the last 24 hours: ${ticker ? `${formatCompact(ticker.volume_24h)} ${base}` : "—"}, quoted in USDT.`}
          value={
            ticker && isNum(ticker.quote_volume_24h)
              ? `$${formatCompact(ticker.quote_volume_24h)}`
              : undefined
          }
        />
      </dl>
    </div>
  );
}

function Stat({ label, value, info }: { label: string; value: string | undefined; info?: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-fg-subtle">
        {label}
        {info ? <InfoTooltip content={info} /> : null}
      </dt>
      <dd className="mt-0.5 num text-dense text-fg">{value ?? <Skeleton className="h-4 w-16" />}</dd>
    </div>
  );
}

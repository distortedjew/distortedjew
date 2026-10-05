import { cn } from "@/lib/cn";
import { formatPct, formatPnl, isNum, toneOf } from "@/lib/format";
import { TONE_TEXT } from "@/lib/tones";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

export interface PnlTextProps {
  /** Money P&L (USDT). */
  value: number | null | undefined;
  /** Optional percent (already in percent units). */
  pct?: number | null;
  /** Show only the percent. */
  pctOnly?: boolean;
  /** Count smoothly to new values. */
  animate?: boolean;
  /** Use compact money ("+$1.2K"). */
  compact?: boolean;
  className?: string;
  pctClassName?: string;
}

/**
 * Signed, colored P&L: "+$482.31 (+4.82%)". Sign and color always agree; zero is neutral.
 *
 *   <PnlText value={position.unrealized_pnl} pct={position.unrealized_pnl_pct} animate />
 */
export function PnlText({ value, pct, pctOnly, animate, compact, className, pctClassName }: PnlTextProps) {
  const tone = toneOf(isNum(value) ? value : pct);
  const money = (n: number) => formatPnl(n, { compact });
  const percent = (n: number) => formatPct(n, { signed: true });

  return (
    <span className={cn("num inline-flex items-baseline gap-1.5 whitespace-nowrap", TONE_TEXT[tone], className)}>
      {pctOnly ? null : animate ? <AnimatedNumber value={value} format={money} /> : <span>{isNum(value) ? money(value) : "—"}</span>}
      {isNum(pct) ? (
        <span className={cn(!pctOnly && "text-[0.92em] opacity-80", pctClassName)}>
          {pctOnly ? percent(pct) : `(${percent(pct)})`}
        </span>
      ) : null}
    </span>
  );
}

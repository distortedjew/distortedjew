import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatPrice, isNum } from "@/lib/format";

export interface PriceTextProps {
  value: number | null | undefined;
  format?: (value: number) => string;
  /** Flash green / red briefly when the value changes (default true). */
  flash?: boolean;
  className?: string;
}

/**
 * Live price in tabular mono figures that flashes green (up) or red (down) for a moment
 * when it changes — the classic order-book tick. Direction is also readable from the number.
 *
 *   <PriceText value={ticker.price} className="text-lg" />
 */
export function PriceText({
  value,
  format = (v) => formatPrice(v),
  flash = true,
  className,
}: PriceTextProps) {
  const [previous, setPrevious] = useState(value);
  const [tick, setTick] = useState<{ dir: "up" | "down"; n: number } | null>(null);

  // Derive the flash from the previous render's value (no effect, no extra frame).
  if (value !== previous) {
    setPrevious(value);
    if (flash && isNum(value) && isNum(previous) && value !== previous) {
      setTick((t) => ({ dir: value > previous ? "up" : "down", n: (t?.n ?? 0) + 1 }));
    }
  }

  return (
    <span
      key={tick?.n ?? 0}
      className={cn(
        "-mx-0.5 inline-block rounded-[3px] px-0.5 num",
        tick && (tick.dir === "up" ? "animate-flash-up" : "animate-flash-down"),
        className,
      )}
    >
      {isNum(value) ? format(value) : "—"}
    </span>
  );
}

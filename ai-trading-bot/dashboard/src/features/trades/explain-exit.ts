import { formatDuration, formatPct, formatPrice, formatR } from "@/lib/format";
import type { Trade } from "@/types";

/**
 * A plain-language account of why a trade ended, using the actual numbers: where it exited
 * relative to the level that triggered it (slippage / gap), how long it was open and the result.
 */
export function explainExit(
  t: Pick<
    Trade,
    | "exit_reason"
    | "side"
    | "exit_price"
    | "stop_loss"
    | "take_profit"
    | "duration_sec"
    | "r_multiple"
    | "mfe_pct"
  >,
): string {
  const levelGap = (level: number) => {
    const diff = t.exit_price - level;
    return Math.abs(diff) / level > 0.00005
      ? ` (${formatPct((Math.abs(diff) / level) * 100)} from the level)`
      : "";
  };
  switch (t.exit_reason) {
    case "STOP_LOSS":
      return `Price reached the stop loss at ${formatPrice(t.stop_loss)}. The position was closed at ${formatPrice(t.exit_price)}${levelGap(t.stop_loss)} for ${formatR(t.r_multiple)}. Stops fill at the stop level, or at the gapped price when that is worse.`;
    case "TAKE_PROFIT":
      return `Price reached the take profit at ${formatPrice(t.take_profit)} and the position was closed at ${formatPrice(t.exit_price)}${levelGap(t.take_profit)} for ${formatR(t.r_multiple)}.`;
    case "SIGNAL_REVERSAL":
      return `A confident ${t.side === "LONG" ? "short" : "long"} signal arrived while this ${t.side.toLowerCase()} was open, so it was closed at ${formatPrice(t.exit_price)} before reaching its stop or target (${formatR(t.r_multiple)}).`;
    case "TIME_EXIT":
      return `Neither the stop nor the target was reached within the maximum holding time, so the position was closed after ${formatDuration(t.duration_sec)} at ${formatPrice(t.exit_price)} (${formatR(t.r_multiple)}).`;
    case "KILL_SWITCH":
      return `The daily loss limit was hit and every open position was flattened, this one at ${formatPrice(t.exit_price)} (${formatR(t.r_multiple)}). Trading stays halted until the next UTC day.`;
  }
}

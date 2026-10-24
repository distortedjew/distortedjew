import type { Config } from "./config.ts";
import type { Position } from "./types.ts";

export type ExitDecision =
  | { action: "hold" }
  | { action: "sell"; fraction: number; reason: string; tpIndex?: number };

/** Pure exit logic, evaluated on every price tick. `fraction` is of the ORIGINAL position. */
export function decideExit(
  pos: Position,
  price: number,
  now: number,
  cfg: Config,
): ExitDecision {
  const sellAll = (reason: string): ExitDecision => ({
    action: "sell",
    fraction: pos.remainingFraction,
    reason,
  });

  if (price <= pos.entryPrice * (1 - cfg.stopLossPct / 100)) return sellAll("stop-loss");

  for (let i = 0; i < cfg.takeProfits.length; i++) {
    const tp = cfg.takeProfits[i];
    if (!pos.tpHit[i] && price >= pos.entryPrice * tp.multiple) {
      const fraction = Math.min(tp.fraction, pos.remainingFraction);
      return { action: "sell", fraction, reason: `take-profit ${tp.multiple}x`, tpIndex: i };
    }
  }

  // Trailing stop only arms once the first take-profit has been taken.
  if (pos.tpHit.some(Boolean) && price <= pos.peakPrice * (1 - cfg.trailingStopPct / 100))
    return sellAll("trailing-stop");

  if (now - pos.entryTime >= cfg.maxHoldSec * 1000) return sellAll("max-hold timeout");
  return { action: "hold" };
}

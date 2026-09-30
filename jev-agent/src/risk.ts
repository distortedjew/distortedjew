import type { Config } from "./config.js";

export interface Order { symbol: string; side: "buy" | "sell"; usd: number }
export interface RiskView { symbolUsd: number; totalUsd: number; equity: number }

/**
 * Hard limits enforced outside the model. The model can be wrong; these cannot be argued with.
 * Spot only: we never go short, "sell" means reduce or close a long.
 */
export class Risk {
  private orderTimes: number[] = [];
  private startEquity: number | null = null;
  halted = false;
  constructor(private cfg: Config["risk"], private now: () => number = Date.now) {}

  /** Returns the (possibly reduced) order, or null with a reason. */
  check(o: Order, v: RiskView): { order: Order | null; reason?: string } {
    this.startEquity ??= v.equity;
    if (v.equity - this.startEquity <= -this.cfg.dailyLossLimitUsd) this.halted = true;
    // Once halted only closing trades are allowed.
    if (this.halted && o.side === "buy") return { order: null, reason: "halted: daily loss limit" };

    const t = this.now();
    this.orderTimes = this.orderTimes.filter((x) => t - x < 60_000);
    if (this.orderTimes.length >= this.cfg.maxOrdersPerMin) return { order: null, reason: "order rate limit" };

    let usd = o.usd;
    if (o.side === "buy") {
      usd = Math.min(usd, this.cfg.maxPositionUsd - v.symbolUsd, this.cfg.maxTotalExposureUsd - v.totalUsd);
      if (usd < 1) return { order: null, reason: "position/exposure cap" };
    } else {
      usd = Math.min(usd, v.symbolUsd);
      if (usd < 1) return { order: null, reason: "nothing to sell (no shorting)" };
    }
    this.orderTimes.push(t);
    return { order: { ...o, usd } };
  }

  /** True when the loss limit is hit and open positions should be flattened. */
  shouldFlatten(equity: number) {
    this.startEquity ??= equity;
    if (equity - this.startEquity <= -this.cfg.dailyLossLimitUsd) this.halted = true;
    return this.halted;
  }

  /** Call at UTC midnight to start a new day. */
  resetDay() { this.halted = false; this.startEquity = null; }
}

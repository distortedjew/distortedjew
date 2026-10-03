// r1-etf-dualmom: dual momentum / asset-class rotation, two classic sleeves blended 50/50.
//
// Sleeve A, Global Equities Momentum (Antonacci 2012/2014): hold whichever of SPY / EFA has the higher
//   momentum, but only if it beats SHY (absolute momentum vs. T-bills); otherwise hold IEF.
// Sleeve B, Defensive Asset Allocation (Keller & Keuning 2018): rank a 10-asset risky menu by 13612W
//   momentum and hold the top 6 equally; the "canary" assets EEM and AGG set the defensive fraction
//   (0, 1 or 2 canaries with non-positive momentum => 0%, 50%, 100% defensive). The defensive part goes
//   to the best of SHY / IEF / LQD by momentum.
// Momentum = Keller's 13612W: (12*r1m + 4*r3m + 2*r6m + r12m)/4, with a month = 21 trading days.
// Rebalanced on the first trading day of each month (fills next open).
import type { Ctx, Strategy } from "../harness.js";

const M = 21;                                       // trading days per month
const LOOKBACKS = [1, 3, 6, 12].map((k) => k * M);  // 13612W horizons
const GEM_RISKY = ["SPY", "EFA"], GEM_SAFE = "IEF", CASH = "SHY";
const DAA_RISKY = ["SPY", "QQQ", "IWM", "EFA", "EEM", "VNQ", "GLD", "TLT", "HYG", "LQD"];
const DAA_CANARY = ["EEM", "AGG"];
const DAA_DEF = ["SHY", "IEF", "LQD"];
const DAA_TOP = 6;

function ret(ctx: Ctx, s: string, n: number) {
  const c = ctx.closes(s, n + 1);
  return c.length < n + 1 ? NaN : c[n] / c[0] - 1;
}
function mom(ctx: Ctx, s: string) {
  const [r1, r3, r6, r12] = LOOKBACKS.map((n) => ret(ctx, s, n));
  return (12 * r1 + 4 * r3 + 2 * r6 + r12) / 4;
}
const ranked = (ctx: Ctx, list: string[]) =>
  list.filter((x) => ctx.has(x) && Number.isFinite(mom(ctx, x)))
    .map((x) => [x, mom(ctx, x)] as const).sort((a, b) => b[1] - a[1]);

let month = "";
const s: Strategy = {
  name: "r1-etf-dualmom",
  description: "50% GEM (SPY/EFA vs SHY, else IEF) + 50% DAA (top-6 of 10 risky by 13612W, EEM/AGG canary -> best of SHY/IEF/LQD), monthly",
  onBar(ctx) {
    const m = ctx.date.slice(0, 7);
    if (m === month) return null;
    const gem = ranked(ctx, GEM_RISKY), risky = ranked(ctx, DAA_RISKY), def = ranked(ctx, DAA_DEF);
    const cash = mom(ctx, CASH);
    if (!gem.length || risky.length < DAA_TOP || !def.length || !Number.isFinite(cash)) return null;
    month = m;
    const w: Record<string, number> = {};
    const add = (k: string, x: number) => { if (x > 0) w[k] = (w[k] ?? 0) + x; };
    // Sleeve A: GEM
    add(gem[0][1] > cash ? gem[0][0] : GEM_SAFE, 0.5);
    // Sleeve B: DAA
    const bad = DAA_CANARY.filter((c) => !(mom(ctx, c) > 0)).length;
    const defFrac = bad / DAA_CANARY.length;
    for (const [x] of risky.slice(0, DAA_TOP)) add(x, (0.5 * (1 - defFrac)) / DAA_TOP);
    add(def[0][0], 0.5 * defFrac);
    return w;
  },
};
export default s;

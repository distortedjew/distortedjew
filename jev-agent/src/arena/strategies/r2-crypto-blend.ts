// r2-crypto-blend: 50/50 sleeve blend of two different trend signals on crypto.
//   Sleeve A = r1-crypto-regime (multi-horizon Donchian ensemble, vol-targeted, BTC>SMA100 gate).
//   Sleeve B = r1-crypto-volbreakout (Keltner breakout + ATR chandelier exit, inverse-ATR sizing).
// Rationale: trend-following signals of different construction/horizon are imperfectly correlated, so
// splitting capital between them (fixed, a priori equal weights; no optimisation) should lower variance
// more than it lowers return. Optionally the champion's BTC regime gate is applied to sleeve B as well
// (crypto is a one-factor market: alt breakouts in a BTC bear regime are mostly bear-market rallies).
// Each sleeve sees its own virtual portfolio (ctx.weights() replaced by the sleeve's drifting weights) so
// its internal rebalance hysteresis works as standalone. Sleeves are netted before trading: a symbol is
// only re-traded when its combined target changes, so costs are not paid twice.
import type { Ctx, Strategy } from "../harness.js";
import regime from "./r1-crypto-regime.js";
import breakout from "./r1-crypto-volbreakout.js";

const W_A = Number(process.env.BLEND_WA ?? 0.5); // champion sleeve weight (fixed a priori: equal weight)
const GATE_B = (process.env.BLEND_GATE ?? "1") === "1"; // apply BTC regime gate to breakout sleeve
const BTC_MA = 100;

interface Sleeve { w: Record<string, number>; px: Record<string, number> }
const mkSleeve = (): Sleeve => ({ w: {}, px: {} });
const sA = mkSleeve(), sB = mkSleeve();
let lastCombined: Record<string, number> = {};

// drift a sleeve's virtual weights with today's closes
function drift(s: Sleeve, ctx: Ctx) {
  let tot = 1 - Object.values(s.w).reduce((a, b) => a + b, 0); // cash
  const nw: Record<string, number> = {};
  for (const sym in s.w) {
    const p = ctx.closes(sym, 1)[0];
    const r = s.px[sym] && p ? p / s.px[sym] : 1;
    nw[sym] = s.w[sym] * r; tot += nw[sym];
    if (p) s.px[sym] = p;
  }
  for (const sym in nw) nw[sym] /= tot > 0 ? tot : 1;
  s.w = nw;
}
function apply(s: Sleeve, ctx: Ctx, out: Record<string, number> | null) {
  if (!out) return;
  const nw: Record<string, number> = {};
  for (const sym of ctx.symbols) {
    const x = Math.max(0, Number(out[sym] ?? 0));
    if (x > 0) { nw[sym] = x; s.px[sym] = ctx.closes(sym, 1)[0]; }
  }
  const sum = Object.values(nw).reduce((a, b) => a + b, 0);
  if (sum > 1) for (const k in nw) nw[k] /= sum;
  s.w = nw;
}
const view = (ctx: Ctx, s: Sleeve): Ctx => ({ ...ctx, weights: () => Object.fromEntries(ctx.symbols.map((x) => [x, s.w[x] ?? 0])) });

const strat: Strategy = {
  name: "r2-crypto-blend",
  description: `Fixed ${W_A}/${1 - W_A} blend of r1-crypto-regime and r1-crypto-volbreakout${GATE_B ? " (BTC>SMA100 gate on both)" : ""}, sleeves netted before trading`,
  onBar(ctx: Ctx) {
    drift(sA, ctx); drift(sB, ctx);
    apply(sA, ctx, regime.onBar(view(ctx, sA)));
    apply(sB, ctx, breakout.onBar(view(ctx, sB)));
    let bull = true;
    if (GATE_B) {
      const b = ctx.closes("BTC", BTC_MA);
      bull = b.length >= BTC_MA && b.at(-1)! >= b.reduce((a, x) => a + x, 0) / b.length;
    }
    const comb: Record<string, number> = {};
    for (const sym of ctx.symbols) comb[sym] = W_A * (sA.w[sym] ?? 0) + (1 - W_A) * (bull ? sB.w[sym] ?? 0 : 0);
    // net: only re-trade a symbol when its combined target changed materially (a sleeve traded it)
    const cur = ctx.weights();
    const out: Record<string, number> = {};
    for (const sym of ctx.symbols) {
      const prev = lastCombined[sym] ?? 0, t = comb[sym];
      const changed = (t === 0) !== (prev === 0) || Math.abs(t - prev) > 0.1 * Math.max(t, prev);
      if (changed) { out[sym] = t; lastCombined[sym] = t; } else out[sym] = cur[sym] ?? 0;
      if (!ctx.has(sym)) out[sym] = cur[sym] ?? 0;
    }
    return out;
  },
};
export default strat;

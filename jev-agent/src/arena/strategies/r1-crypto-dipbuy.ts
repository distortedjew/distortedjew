// r1-crypto-dipbuy: buy-the-dip within uptrends, on top of a trend core.
// Per coin: if close > SMA(50) hold a vol-targeted "core" position. While in the uptrend, a sharp
// short-term pullback (RSI(3) < 10) adds a 50% overweight "dip" sleeve, which exits when the close
// recovers above SMA(5), after 10 days, or when the trend filter breaks.
// Ablation on train: the dip sleeve is roughly neutral (Sharpe 2.29 with it vs 2.31 core-only);
// a pure dip-buy strategy (no core) only reached Sharpe 0.4-0.8 after 0.30%/side costs.
import type { Ctx, Strategy } from "../harness.js";

const P = {
  trend: 50,     // long-term SMA trend filter
  rsiN: 3,       // short RSI length
  entry: 10,     // RSI dip threshold
  exitMa: 5,     // dip exits when close > SMA(exitMa)
  maxHold: 10,   // dip time stop (days)
  core: 1,       // core weight (x size) while above trend
  dip: 0.5,      // extra dip weight (x size) while a dip is open
  slot: 0.4,     // max size per coin
  volTgt: 0.5,   // per-coin annualised vol target used to scale size
  volN: 30,      // vol lookback
};

const sma = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
function rsi(c: number[], n: number) {
  // Wilder RSI over the last ~10n bars
  let up = 0, dn = 0;
  const start = Math.max(1, c.length - 10 * n);
  for (let i = start; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    const u = d > 0 ? d : 0, l = d < 0 ? -d : 0;
    if (i === start) { up = u; dn = l; } else { up = (up * (n - 1) + u) / n; dn = (dn * (n - 1) + l) / n; }
  }
  return dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
}
function vol(c: number[], bpy: number) {
  const r: number[] = []; for (let i = 1; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1]));
  const m = sma(r); return Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1) * bpy);
}

const held = new Map<string, number>(); // sym -> days the dip sleeve has been open

const s: Strategy = {
  name: "r1-crypto-dipbuy",
  description: "Vol-targeted SMA(50) trend core per coin plus a 50% overweight on RSI(3)<10 dips inside the uptrend (exit > SMA5 / 10d / trend break)",
  onBar(ctx: Ctx) {
    const cur = ctx.weights();
    const out: Record<string, number> = {};
    for (const sym of ctx.symbols) {
      const w0 = cur[sym] ?? 0;
      if (!ctx.has(sym)) { out[sym] = w0; continue; }
      const c = ctx.closes(sym, Math.max(P.trend, 40 * P.rsiN, P.volN + 1) + 1);
      if (c.length < P.trend + 1) { out[sym] = 0; held.delete(sym); continue; }
      const last = c[c.length - 1];
      const up = last > sma(c.slice(-P.trend));
      const r = rsi(c, P.rsiN);
      const size = Math.min(P.slot, P.slot * P.volTgt / vol(c.slice(-P.volN - 1), ctx.barsPerYear));
      if (held.has(sym)) {
        const d = held.get(sym)! + 1; held.set(sym, d);
        if (last > sma(c.slice(-P.exitMa)) || d >= P.maxHold || !up) held.delete(sym);
      } else if (up && r < P.entry) held.set(sym, 0);
      const tgt = (up ? P.core * size : 0) + (held.has(sym) ? P.dip * size : 0);
      // avoid churn from drift: only trade if the target change is material
      out[sym] = Math.abs(tgt - w0) > 0.25 * size || tgt === 0 ? tgt : w0;
    }
    return out;
  },
};
export default s;

// r2-etf-champplus: the r1-etf-volmanaged champion with one change — a two-fund equity sleeve.
//  Base (unchanged): equity sized by 0.6 * 16% / 20d realized vol (cap 100%) — volatility-managed equity
//  (Moreira & Muir 2017); remainder in IEF/TLT/GLD inverse-vol weighted (60d), each held only above its
//  200d SMA, otherwise SHY; 5% no-trade band.
//  Change: the equity sleeve is an equal-weight SPY+QQQ basket instead of SPY alone, and the vol scaling uses
//  the basket's own 20d realized vol. Rationale: vol-management works best on the assets whose vol is most
//  time-varying/clustered (Moreira & Muir find larger gains for higher-vol, growth-heavy portfolios); QQQ is
//  the most liquid such large-cap sleeve. CAVEAT: QQQ's 2009-2023 outperformance is known in hindsight.
//  (A SPY 200d trend filter was tried first: train 0.93 but validation 0.80 — rejected.)
import type { Ctx, Strategy } from "../harness.js";

const P = {
  volLb: 20,        // realized-vol lookback for equity sleeve (days)
  eqBase: 0.6,      // equity weight at "normal" vol
  normVol: 0.16,    // long-run equity vol used as the normal level
  eqMax: 1.0,       // cap on equity weight
  trendLb: 200,     // hedge-asset trend filter (SMA days)
  hVolLb: 60,       // hedge-asset vol lookback
  band: 0.05,       // no-trade band (abs weight)
};
const EQS = ["SPY", "QQQ"];
const HEDGE = ["IEF", "TLT", "GLD"];
const CASH = "SHY";

function rvol(c: number[]): number {
  const r: number[] = [];
  for (let i = 1; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1) * 252);
}
const mean = (c: number[]) => c.reduce((a, b) => a + b, 0) / c.length;

const s: Strategy = {
  name: "r2-etf-champplus",
  description: "r1-etf-volmanaged with equity sleeve = equal-weight SPY+QQQ sized by 0.6*16%/basket 20d vol (cap 100%); rest IEF/TLT/GLD inverse-vol, each only above 200d SMA else SHY; 5% band",
  onBar(ctx: Ctx) {
    const n = P.volLb + 1;
    const cs = EQS.map((e) => ctx.closes(e, n));
    if (cs.some((c) => c.length < n)) return null;
    const basket: number[] = [1]; // daily-rebalanced equal-weight basket index
    for (let i = 1; i < n; i++) {
      let r = 0;
      for (const c of cs) r += c[i] / c[i - 1] - 1;
      basket.push(basket[i - 1] * (1 + r / cs.length));
    }
    const eqW = Math.min(P.eqMax, P.eqBase * (P.normVol / rvol(basket)));
    const tgt: Record<string, number> = {};
    for (const e of EQS) tgt[e] = eqW / EQS.length;
    const rest = 1 - eqW;
    const inv: Record<string, number> = {};
    let invSum = 0;
    for (const h of HEDGE) {
      const c = ctx.closes(h, Math.max(P.trendLb, P.hVolLb + 1));
      if (c.length < P.trendLb) continue;
      const v = rvol(c.slice(-(P.hVolLb + 1)));
      inv[h] = 1 / v; invSum += 1 / v;
    }
    let cashW = 0;
    for (const h in inv) {
      const c = ctx.closes(h, P.trendLb);
      const w = rest * inv[h] / invSum;
      if (c[c.length - 1] > mean(c)) tgt[h] = (tgt[h] ?? 0) + w; else cashW += w;
    }
    if (invSum === 0) cashW = rest;
    tgt[CASH] = (tgt[CASH] ?? 0) + cashW;
    const cur = ctx.weights();
    const syms = new Set([...Object.keys(tgt), ...Object.keys(cur)]);
    let maxDiff = 0;
    for (const k of syms) maxDiff = Math.max(maxDiff, Math.abs((tgt[k] ?? 0) - (cur[k] ?? 0)));
    if (maxDiff < P.band) return null;
    return tgt;
  },
};
export default s;

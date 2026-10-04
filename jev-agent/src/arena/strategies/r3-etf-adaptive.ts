// r3-etf-adaptive: the r1-etf-volmanaged chassis with a REAL-TIME equity-sleeve selection rule, replacing
// r2-etf-champplus's hand-picked SPY+QQQ sleeve.
//  Equity sleeve: once a month (first bar of a new month) rank {SPY, QQQ, IWM, EFA, EEM, VTI, DIA} by 12-1
//  month momentum (return from t-252 to t-21 days; Jegadeesh & Titman 1993, Asness/Moskowitz/Pedersen 2013
//  for cross-asset/country momentum) and hold the top 2 equal-weighted. The basket is sized by
//  0.6 * 16% / basket 20d realized vol (cap 100%) — volatility-managed equity (Moreira & Muir 2017).
//  Hedge (unchanged): remainder in IEF/TLT/GLD inverse-vol weighted (60d), each only above its 200d SMA,
//  otherwise SHY; 5% no-trade band.
//  No hindsight: the candidate set is the arena's broad equity index ETFs (no sectors), fixed in advance.
import type { Ctx, Strategy } from "../harness.js";

const env = (k: string, d: number) => (process.env[k] !== undefined ? Number(process.env[k]) : d);
const P = {
  volLb: 20,                   // realized-vol lookback for equity sleeve (days)
  eqBase: 0.6,                 // equity weight at "normal" vol
  normVol: 0.16,               // long-run equity vol used as the normal level
  eqMax: 1.0,                  // cap on equity weight
  momLb: env("R3_MOMLB", 252), // momentum lookback (days)
  momSkip: env("R3_SKIP", 21), // skip most recent month
  topN: env("R3_TOPN", 2),     // number of equity ETFs held
  trendLb: 200,                // hedge-asset trend filter (SMA days)
  hVolLb: 60,                  // hedge-asset vol lookback
  band: 0.05,                  // no-trade band (abs weight)
};
const UNIVERSE = ["SPY", "QQQ", "IWM", "EFA", "EEM", "VTI", "DIA"];
const HEDGE = ["IEF", "TLT", "GLD"];
const CASH = "SHY";

let lastMonth = "";
let eqs: string[] = ["SPY"];

function rvol(c: number[]): number {
  const r: number[] = [];
  for (let i = 1; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1) * 252);
}
const mean = (c: number[]) => c.reduce((a, b) => a + b, 0) / c.length;

function rerank(ctx: Ctx) {
  const scores: { s: string; m: number }[] = [];
  for (const s of UNIVERSE) {
    const c = ctx.closes(s, P.momLb + 1);
    if (c.length < P.momLb + 1) continue;
    scores.push({ s, m: c[c.length - 1 - P.momSkip] / c[0] - 1 });
  }
  if (scores.length === 0) return;
  scores.sort((a, b) => b.m - a.m);
  eqs = scores.slice(0, Math.min(P.topN, scores.length)).map((x) => x.s);
}

const s: Strategy = {
  name: "r3-etf-adaptive",
  description: "volmanaged chassis; equity sleeve = top 2 of SPY/QQQ/IWM/EFA/EEM/VTI/DIA by 12-1m momentum (monthly), equal-weight, sized by 0.6*16%/basket 20d vol (cap 100%); rest IEF/TLT/GLD inverse-vol, each only above 200d SMA else SHY; 5% band",
  onBar(ctx: Ctx) {
    const month = ctx.date.slice(0, 7);
    if (month !== lastMonth) { lastMonth = month; rerank(ctx); }
    const n = P.volLb + 1;
    const cs = eqs.map((e) => ctx.closes(e, n));
    if (cs.some((c) => c.length < n)) return null;
    const basket: number[] = [1];
    for (let i = 1; i < n; i++) {
      let r = 0;
      for (const c of cs) r += c[i] / c[i - 1] - 1;
      basket.push(basket[i - 1] * (1 + r / cs.length));
    }
    const eqW = Math.min(P.eqMax, P.eqBase * (P.normVol / rvol(basket)));
    const tgt: Record<string, number> = {};
    for (const e of eqs) tgt[e] = eqW / eqs.length;
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

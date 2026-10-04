// r1-etf-volmanaged: volatility-managed equity (Moreira & Muir 2017) + trend/vol-weighted bond/gold hedge.
// Equity sleeve (SPY) scaled inversely to 20d realized vol; the remainder goes to IEF/TLT/GLD (inverse-vol
// weighted, each held only above its 200d SMA, otherwise SHY). Evaluated daily, traded only past a 5% band.
import type { Ctx, Strategy } from "../harness.js";

const P = {
  volLb: 20,        // realized-vol lookback for equity sleeve (days)
  eqBase: 0.6,     // equity weight at "normal" vol
  normVol: 0.16,  // SPY long-run vol used as the normal level
  eqMax: 1.0,       // cap on equity weight
  power: 1,         // 1 = inverse vol, 2 = inverse variance
  trendLb: 200,   // hedge-asset trend filter (SMA days)
  hVolLb: 60,      // hedge-asset vol lookback
  band: 0.05,        // no-trade band (abs weight)
};
const EQ = "SPY";
const HEDGE = ["IEF", "TLT", "GLD"];
const CASH = "SHY";

function rvol(c: number[]): number {
  const r: number[] = [];
  for (let i = 1; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1) * 252);
}

const s: Strategy = {
  name: "r1-etf-volmanaged",
  description: "SPY sized by 20d realized vol (60% at 16% vol, cap 100%); remainder in IEF/TLT/GLD inverse-vol weighted, each only above its 200d SMA else SHY; 5% no-trade band",
  onBar(ctx: Ctx) {
    const ec = ctx.closes(EQ, P.volLb + 1);
    if (ec.length < P.volLb + 1) return null;
    const sv = rvol(ec);
    const eqW = Math.min(P.eqMax, P.eqBase * Math.pow(P.normVol / sv, P.power));
    const tgt: Record<string, number> = { [EQ]: eqW };
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
      const sma = c.reduce((a, b) => a + b, 0) / c.length;
      const w = rest * inv[h] / invSum;
      if (c[c.length - 1] > sma) tgt[h] = (tgt[h] ?? 0) + w; else cashW += w;
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

// r1-etf-riskparity: GTAA-style trend-filtered risk parity with a portfolio volatility target.
// Idea: Faber (2007) "A Quantitative Approach to Tactical Asset Allocation": hold each asset class only
// while it trades above its 10-month (~200d) SMA; size the survivors by inverse volatility (naive risk
// parity, Maillard/Roncalli; Asness-Frazzini-Pedersen 2012), then scale the whole book to a portfolio
// vol target (Moreira-Muir 2017) using the sample covariance; if the 20d vol of the current book breaches
// target*(1+band) mid-month, rebalance early. No leverage: sum of weights <= 1;
// any unallocated capital is parked in SHY (short Treasuries, the arena's cash proxy). Monthly rebalance.
import type { Ctx, Strategy } from "../harness.js";

const env = (k: string, d: number) => (process.env[k] !== undefined ? Number(process.env[k]) : d);
const P = {
  sma: env("RP_SMA", 200),        // trend filter length (10 months)
  volLb: env("RP_VOL", 60),       // vol / covariance lookback (days)
  target: env("RP_TARGET", 0.06), // annual portfolio vol target
  cash: env("RP_CASH", 1),        // 1 = park residual in SHY, 0 = hold cash
  band: env("RP_BAND", 0.25),     // mid-month de-risk when 20d vol of current book > target*(1+band)
};
const CORE = ["SPY", "EFA", "EEM", "VNQ", "IEF", "TLT", "LQD", "TIP", "GLD"];

function rets(c: number[]) { const r: number[] = []; for (let i = 1; i < c.length; i++) r.push(c[i] / c[i - 1] - 1); return r; }

function covOf(R: number[][], bpy: number) {
  const n = R[0].length, mean = R.map((r) => r.reduce((a, b) => a + b, 0) / n);
  return R.map((a, i) => R.map((b, j) => { let s = 0; for (let t = 0; t < n; t++) s += (a[t] - mean[i]) * (b[t] - mean[j]); return (s / (n - 1)) * bpy; }));
}
function bookVol(ctx: Ctx, on: string[], R: number[][]) {
  // vol of the CURRENT holdings (in-trend assets only) using the last 20 days
  const cur = ctx.weights(), R20 = R.map((r) => r.slice(-20)), c = covOf(R20, ctx.barsPerYear);
  let v = 0; for (let i = 0; i < on.length; i++) for (let j = 0; j < on.length; j++) v += (cur[on[i]] ?? 0) * (cur[on[j]] ?? 0) * c[i][j];
  return Math.sqrt(Math.max(v, 0));
}

let month = "";
const s: Strategy = {
  name: "r1-etf-riskparity",
  description: `GTAA ${P.sma}d SMA filter on 9-asset core, inverse-vol (${P.volLb}d) weights, ${P.target * 100}% vol target (20d-vol band ${P.band * 100}% for mid-month de-risk), residual in SHY, monthly`,
  onBar(ctx: Ctx) {
    const m = ctx.date.slice(0, 7);
    const newMonth = m !== month;
    if (!newMonth && !P.band) return null;
    const on: string[] = [], R: number[][] = [];
    for (const sym of CORE) {
      if (!ctx.has(sym)) continue;
      const c = ctx.closes(sym, Math.max(P.sma, P.volLb + 1));
      if (c.length < P.sma) continue;
      const sma = c.slice(-P.sma).reduce((a, b) => a + b, 0) / P.sma;
      if (c[c.length - 1] <= sma) continue;
      on.push(sym); R.push(rets(c.slice(-(P.volLb + 1))));
    }
    if (!newMonth) {
      let go = false;
      if (P.band && on.length) go = bookVol(ctx, on, R) > P.target * (1 + P.band);
      if (!go) return null;
    }
    month = m;
    const w: Record<string, number> = {};
    if (on.length) {
      const n = R[0].length, mean = R.map((r) => r.reduce((a, b) => a + b, 0) / n);
      const cov = R.map((a, i) => R.map((b, j) => { let s = 0; for (let t = 0; t < n; t++) s += (a[t] - mean[i]) * (b[t] - mean[j]); return (s / (n - 1)) * ctx.barsPerYear; }));
      const iv = on.map((_, i) => 1 / Math.sqrt(Math.max(cov[i][i], 1e-8)));
      const sum = iv.reduce((a, b) => a + b, 0);
      const raw = iv.map((x) => x / sum);
      let pv = 0; for (let i = 0; i < raw.length; i++) for (let j = 0; j < raw.length; j++) pv += raw[i] * raw[j] * cov[i][j];
      const k = Math.min(1, P.target / Math.sqrt(Math.max(pv, 1e-10)));
      on.forEach((sym, i) => (w[sym] = raw[i] * k));
    }
    const used = Object.values(w).reduce((a, b) => a + b, 0);
    if (P.cash && used < 0.999 && ctx.has("SHY")) w.SHY = 1 - used;
    return w;
  },
};
export default s;

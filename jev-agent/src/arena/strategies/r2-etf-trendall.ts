// r2-etf-trendall: long-only "managed futures" style time-series momentum across the 26-ETF menu.
// Evidence: Moskowitz/Ooi/Pedersen (2012) "Time Series Momentum" and Hurst/Ooi/Pedersen (2017) "A Century
// of Evidence on Trend-Following": an asset's own past 1-12 month return predicts its next-month return;
// a vol-scaled, diversified book of such trends earns positive risk-adjusted returns. Vol targeting itself
// adds to Sharpe (Moreira/Muir 2017). Implementation:
//  - signal_i = mean over horizons {21,63,126,252}d of clip(z_h, -1, 1), z_h = h-day log return / (daily vol
//    * sqrt(h)); long-only => max(0, signal). Continuous, so positions fade in/out instead of flip-flopping.
//  - raw_i = signal_i / vol_i (60d), divided by the signal-weighted sum of positive correlations with the
//    other active assets (60d), so the 14 US equity/sector funds and the bond funds act like a few bets.
//  - book scaled to a 5% annual vol target with the full 60d covariance; gross capped at 1 (no leverage:
//    a long-only unlevered book of these assets cannot reach 8-10% without being all-equity, so the
//    target is set where it actually binds); residual parked in SHY (the arena's cash proxy; SHY is not
//    a trend asset itself).
//  - rebalanced on the first bar of each week only if sum |target - current| > 10%; plus a daily emergency
//    re-size if the current book's 20d realized vol exceeds 1.5x target (fast reaction in crashes).
import type { Ctx, Strategy } from "../harness.js";

const env = (k: string, d: number) => (process.env[k] !== undefined ? Number(process.env[k]) : d);
const P = {
  horizons: [21, 63, 126, 252].map((h) => Math.round(h * env("TA_HSCALE", 1))),
  volLb: env("TA_VOL", 60),       // per-asset vol lookback (days)
  covLb: env("TA_COV", 60),       // covariance / correlation lookback (days)
  target: env("TA_TARGET", 0.05), // annual portfolio vol target
  band: env("TA_BAND", 0.10),     // weekly: trade only if sum |target - current| > band
  emerg: env("TA_EMERG", 1.5),    // daily re-size if 20d book vol > emerg * target (0 = off)
  corrAdj: env("TA_CORR", 1),     // 1 = divide by correlated-cluster size
  zcap: env("TA_ZCAP", 1),        // z-score that maps to a full signal
};
const CASH = "SHY";
const maxH = Math.max(...P.horizons);
const need = Math.max(maxH, P.covLb, P.volLb) + 1;

function rets(c: number[]) { const r: number[] = []; for (let i = 1; i < c.length; i++) r.push(c[i] / c[i - 1] - 1); return r; }
function sd(r: number[]) { const m = r.reduce((a, b) => a + b, 0) / r.length; return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)); }
function cov(R: number[][]) {
  const n = R[0].length, mean = R.map((r) => r.reduce((a, b) => a + b, 0) / n);
  return R.map((a, i) => R.map((b, j) => { let s = 0; for (let t = 0; t < n; t++) s += (a[t] - mean[i]) * (b[t] - mean[j]); return s / (n - 1); }));
}
function weekKey(d: string) { const t = Date.parse(d + "T00:00:00Z") / 864e5; return Math.floor((t + 3) / 7); } // Monday-based week number

let lastWeek = -1;
const s: Strategy = {
  name: "r2-etf-trendall",
  description: `Long-only multi-horizon TSMOM (${P.horizons.join("/")}d clipped z avg) on 25 ETFs, inverse-vol (${P.volLb}d) / correlation-cluster adjusted, ${P.target * 100}% vol target via ${P.covLb}d covariance, gross<=1, residual SHY, weekly with ${P.band} band + daily re-size at ${P.emerg}x target`,
  onBar(ctx: Ctx) {
    const wk = weekKey(ctx.date);
    const weekly = wk !== lastWeek;
    const cur = ctx.weights();

    // daily emergency check on the current book
    let emergency = false;
    if (!weekly && P.emerg > 0) {
      const held = ctx.symbols.filter((x) => (cur[x] ?? 0) > 1e-4 && x !== CASH);
      if (held.length) {
        const R = held.map((x) => rets(ctx.closes(x, 21)));
        const n = Math.min(...R.map((r) => r.length));
        if (n >= 15) {
          const C = cov(R.map((r) => r.slice(-n)));
          let v = 0; for (let i = 0; i < held.length; i++) for (let j = 0; j < held.length; j++) v += cur[held[i]] * cur[held[j]] * C[i][j];
          emergency = Math.sqrt(Math.max(v, 0) * ctx.barsPerYear) > P.emerg * P.target;
        }
      }
    }
    if (!weekly && !emergency) return null;

    const act: string[] = [], sig: number[] = [], R: number[][] = [];
    let ready = 0;
    for (const x of ctx.symbols) {
      if (!ctx.has(x) || x === CASH) continue;
      const c = ctx.closes(x, need);
      if (c.length < need) continue;
      ready++;
      const last = c[c.length - 1];
      const r = rets(c.slice(-(P.covLb + 1)));
      const dv = sd(rets(c.slice(-(P.volLb + 1))));
      let sg = 0;
      for (const h of P.horizons) sg += Math.max(-1, Math.min(1, Math.log(last / c[c.length - 1 - h]) / (dv * Math.sqrt(h)) / P.zcap));
      sg /= P.horizons.length;
      if (sg <= 0) continue;
      act.push(x); sig.push(sg); R.push(r);
    }
    if (!ready) return null;
    lastWeek = wk;

    const w: Record<string, number> = {};
    if (act.length) {
      const C = cov(R);
      const vol = act.map((x, i) => sd(rets(ctx.closes(x, P.volLb + 1))) || Math.sqrt(C[i][i]));
      let raw = act.map((_, i) => sig[i] / Math.max(vol[i], 1e-5));
      if (P.corrAdj) {
        raw = raw.map((r, i) => {
          let cs = 0;
          for (let j = 0; j < act.length; j++) cs += sig[j] * Math.max(0, C[i][j] / Math.sqrt(C[i][i] * C[j][j]));
          return r / Math.max(cs, 1e-6);
        });
      }
      let v = 0; for (let i = 0; i < act.length; i++) for (let j = 0; j < act.length; j++) v += raw[i] * raw[j] * C[i][j];
      let k = P.target / Math.sqrt(Math.max(v, 1e-12) * ctx.barsPerYear);
      const gross = raw.reduce((a, b) => a + b, 0) * k;
      if (gross > 1) k /= gross;
      act.forEach((x, i) => { w[x] = raw[i] * k; });
    }
    const tot = Object.values(w).reduce((a, b) => a + b, 0);
    if (tot < 1) w[CASH] = 1 - tot;

    if (!emergency) {
      let diff = 0;
      for (const x of new Set([...Object.keys(w), ...Object.keys(cur)])) diff += Math.abs((w[x] ?? 0) - (cur[x] ?? 0));
      if (diff < P.band) return null;
    }
    return w;
  },
};
export default s;

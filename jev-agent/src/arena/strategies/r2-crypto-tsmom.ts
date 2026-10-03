// r2-crypto-tsmom: multi-horizon time-series momentum with volatility scaling, after Moskowitz, Ooi &
// Pedersen (2012, "Time Series Momentum") and Hurst, Ooi & Pedersen (2017, "A Century of Evidence on
// Trend-Following"). For each coin the trend signal is the average sign of its past return over 1, 3, 6
// and 12 months (30/90/180/365 days); long-only, so a net-negative signal means flat. Each coin is sized
// to a common annualised volatility target (inverse of its 60-day realised vol), scaled by signal
// strength and split equally (1/N) across coins with a full year of history; gross exposure capped at 1.
// Cost control: targets are recomputed daily, but a coin is only traded when its target weight differs
// from its current weight by more than 5% of equity, or when it goes to / from zero.
import type { Ctx, Strategy } from "../harness.js";

const HORIZONS = [30, 90, 180, 365]; // 1, 3, 6, 12 months
const VOL_WIN = 60;                  // days of returns for realised vol
const VOL_TARGET = 0.40;             // annualised vol target per coin, before the 1/N split
const MAX_LEV = 2;                   // cap on per-coin inverse-vol multiplier (only binds for calm coins)
const BAND = 0.05;                   // trade band, fraction of equity

const s: Strategy = {
  name: "r2-crypto-tsmom",
  description: "Avg sign of 30/90/180/365d returns per coin (long-only), inverse-vol sized to 40% vol/coin, 1/N, gross<=1, 5% trade band",
  onBar(ctx: Ctx) {
    const maxH = Math.max(...HORIZONS);
    const raw: Record<string, number> = {};
    let n = 0;
    for (const sym of ctx.symbols) {
      if (!ctx.has(sym)) continue;
      const c = ctx.closes(sym, maxH + 1);
      if (c.length < maxH + 1) continue;
      n++;
      const last = c.at(-1)!;
      const sig = HORIZONS.reduce((a, h) => a + Math.sign(last / c[c.length - 1 - h] - 1), 0) / HORIZONS.length;
      if (sig <= 0) { raw[sym] = 0; continue; }
      const r = c.slice(-VOL_WIN - 1).map((x, i, a) => (i ? Math.log(x / a[i - 1]) : 0)).slice(1);
      const m = r.reduce((a, x) => a + x, 0) / r.length;
      const vol = Math.sqrt((r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1)) * ctx.barsPerYear);
      raw[sym] = vol > 0 ? sig * Math.min(VOL_TARGET / vol, MAX_LEV) : 0;
    }
    if (n === 0) return null;
    const tgt: Record<string, number> = {};
    for (const sym in raw) tgt[sym] = raw[sym] / n;
    const gross = Object.values(tgt).reduce((a, b) => a + b, 0);
    if (gross > 1) for (const sym in tgt) tgt[sym] /= gross;
    const cur = ctx.weights();
    const out: Record<string, number> = {};
    for (const sym of ctx.symbols) {
      const t = tgt[sym] ?? 0, w = cur[sym] ?? 0;
      out[sym] = Math.abs(t - w) > BAND || (t === 0) !== (w < 1e-6) ? t : w;
    }
    return out;
  },
};
export default s;

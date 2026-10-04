// r3-crypto-simple: a deliberately simple, low-parameter crypto trend strategy (overfitting check
// against the 9-model r2-crypto-champplus). Evidence: crypto returns are dominated by one common
// factor (BTC) and show strong time-series momentum (Liu & Tsyvinski 2021, "Risks and Returns of
// Cryptocurrency"); volatility scaling improves trend Sharpe (Moreira & Muir 2017; Hurst et al. 2017).
// Rules:
//   1. Regime: hold crypto only when BTC closes above its 100-day SMA.
//   2. Selection: within risk-on, hold every coin (BTC included) that closes above its own 50-day SMA.
//   3. Sizing: inverse-volatility weights (50-day realised vol, same window as the SMA), then the whole
//      basket is scaled so its realised 50-day volatility hits a 30% annual target; gross <= 1.
//   4. Cost control: targets recomputed daily, a coin is traded only when its target moves more than
//      5% of equity from the current weight, or when it switches on/off.
// Parameters (4, all round): BTC_MA=100, COIN_MA=50 (also the vol window), VOL_TARGET=0.30, BAND=0.05.
import type { Ctx, Strategy } from "../harness.js";

const BTC_MA = 100;
const COIN_MA = 50;
const VOL_TARGET = 0.30;
const BAND = 0.05;

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const rets = (c: number[]) => c.slice(1).map((x, i) => x / c[i] - 1);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };

const s: Strategy = {
  name: "r3-crypto-simple",
  description: `BTC>${BTC_MA}d SMA gate; inverse-vol basket of coins above own ${COIN_MA}d SMA, scaled to ${VOL_TARGET * 100}% portfolio vol, gross<=1, ${BAND * 100}% trade band`,
  onBar(ctx: Ctx) {
    const tgt: Record<string, number> = Object.fromEntries(ctx.symbols.map((x) => [x, 0]));
    const b = ctx.closes("BTC", BTC_MA);
    const riskOn = b.length >= BTC_MA && b.at(-1)! > mean(b);
    if (riskOn) {
      const sel: string[] = [], r: Record<string, number[]> = {}, iv: Record<string, number> = {};
      for (const sym of ctx.symbols) {
        if (!ctx.has(sym)) continue;
        const c = ctx.closes(sym, COIN_MA + 1);
        if (c.length < COIN_MA + 1) continue;
        if (c.at(-1)! <= mean(c.slice(1))) continue;
        r[sym] = rets(c);
        const v = sd(r[sym]);
        if (!(v > 0)) continue;
        sel.push(sym); iv[sym] = 1 / v;
      }
      if (sel.length) {
        const tot = sel.reduce((a, x) => a + iv[x], 0);
        const w = Object.fromEntries(sel.map((x) => [x, iv[x] / tot]));
        // realised vol of the inverse-vol basket over the same window (captures correlation)
        const port = r[sel[0]].map((_, i) => sel.reduce((a, x) => a + w[x] * r[x][i], 0));
        const pv = sd(port) * Math.sqrt(ctx.barsPerYear);
        const k = Math.min(1, VOL_TARGET / pv);
        for (const x of sel) tgt[x] = w[x] * k;
      }
    }
    const cur = ctx.weights();
    return Object.fromEntries(ctx.symbols.map((x) => {
      const c = cur[x] ?? 0, t = tgt[x];
      const trade = (t === 0) !== (c < 1e-6) || Math.abs(t - c) > BAND;
      return [x, trade ? t : c];
    }));
  },
};
export default s;

// r3-crypto-brake: the r2-crypto-champplus champion (Donchian ensemble, BTC>100d SMA market gate, 4-of-9
// consensus, per-coin 50d SMA gate) plus a market-breadth confirmation for alt positions.
//
// Rationale: alt rallies that happen while most of the market is still below trend tend to be narrow,
// short-lived squeezes; durable alt trends come with broad participation (classic breadth confirmation).
// So alts are held only when at least 60% of the live coins (3 of 5) close above their own 50-day SMA;
// otherwise only BTC is held (with its normal weight, freed alt capital stays in cash).
// Result (round 3): train 2.15, validation 1.35, so it does NOT beat the champion's 1.38.
// A BTC-dominance variant (alts only when most alt/BTC ratios are above their 100-day SMA) was also
// tested: train 1.94, validation 0.86 (it missed the narrow 2023-24 SOL/DOGE alt rallies). Rejected.
// A drawdown brake on the unbraked shadow equity was tested on train only and lowered Sharpe at every
// setting (train max DD is ~7.6%, so 10%+ thresholds never fire and 5% ones cut recoveries). Rejected.
import type { Ctx, Strategy } from "../harness.js";
import { DEFAULT_TREND, TrendEngine, needsTrade, targetWeights, type CoinSignal } from "../../strategy/trend.js";

const BTC_MA = 100;    // market regime: BTC close vs its 100-day SMA (unchanged from champion)
const COIN_MA = 50;    // per-coin regime: coin close vs its own 50-day SMA (unchanged)
const MIN_SIGNAL = 0.4; // 4 of 9 Donchian models must be long (unchanged)
const BREADTH = 0.6;   // breadth: at least 60% of live coins (3 of 5) above their own 50-day SMA to hold alts

const sma = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const engines = new Map<string, TrendEngine>();

const s: Strategy = {
  name: "r3-crypto-brake",
  description: "r2-crypto-champplus plus a breadth filter: alts held only when at least 60% of live coins close above their 50-day SMA, else BTC only",
  onBar(ctx: Ctx) {
    const p = { ...DEFAULT_TREND, barsPerYear: ctx.barsPerYear, minHistory: ctx.barsPerYear };
    const sig: Record<string, CoinSignal | null> = {};
    for (const sym of ctx.symbols) {
      let e = engines.get(sym); if (!e) engines.set(sym, (e = new TrendEngine(p)));
      if (ctx.has(sym)) { e.step(ctx.closes(sym, 1)[0]); sig[sym] = e.signal(); } else sig[sym] = null;
    }
    const tgt = targetWeights(sig, p);
    const b = ctx.closes("BTC", BTC_MA);
    const bull = b.length >= BTC_MA && b.at(-1)! >= sma(b);
    const up: Record<string, boolean> = {};
    const live = ctx.symbols.filter((x) => ctx.has(x) && ctx.closes(x, COIN_MA).length >= COIN_MA);
    for (const x of live) { const c = ctx.closes(x, COIN_MA); up[x] = c.at(-1)! >= sma(c); }
    const broad = live.filter((x) => up[x]).length >= BREADTH * live.length;
    for (const sym in tgt) {
      if (!bull || !up[sym] || (sig[sym]?.signal ?? 0) < MIN_SIGNAL) tgt[sym] = 0;
      if (sym !== "BTC" && !broad) tgt[sym] = 0;
    }
    const cur = ctx.weights();
    return Object.fromEntries(ctx.symbols.map((x) => [x, needsTrade(cur[x] ?? 0, tgt[x] ?? 0) ? tgt[x] ?? 0 : cur[x] ?? 0]));
  },
};
export default s;

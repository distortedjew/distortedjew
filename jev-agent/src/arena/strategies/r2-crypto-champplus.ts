// r2-crypto-champplus: the r1-crypto-regime champion (incumbent Donchian ensemble, gated to cash when BTC
// closes below its 100-day SMA) with two whipsaw-reducing filters on top:
//  1. Consensus filter: a coin is held only when at least 4 of the 9 Donchian models (5..360 days) are long.
//     A coin where only one to three fast models are long gets a small position in what is mostly noise.
//     Those trades pay the 0.30% fee each way and are usually stopped out within days.
//  2. Per-coin trend gate: a coin is held only when it also closes above its own 50-day SMA. Crypto has
//     one strong common factor, but alts often lag or diverge from BTC (2019, 2023). BTC being in a bull
//     regime does not make every alt's breakout a real trend.
// Sizing, vol targeting and the trade threshold are unchanged from the incumbent.
import type { Ctx, Strategy } from "../harness.js";
import { DEFAULT_TREND, TrendEngine, needsTrade, targetWeights, type CoinSignal } from "../../strategy/trend.js";

const BTC_MA = 100;    // market regime: BTC close vs its 100-day SMA (unchanged from r1)
const COIN_MA = 50;    // per-coin regime: coin close vs its own 50-day SMA
const MIN_SIGNAL = 0.4; // fraction of Donchian models that must be long (4 of 9)

const sma = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const engines = new Map<string, TrendEngine>();
const s: Strategy = {
  name: "r2-crypto-champplus",
  description: "r1-crypto-regime (Donchian ensemble, BTC>100d SMA gate) plus a 4-of-9 model consensus filter and a per-coin 50-day SMA gate",
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
    for (const sym in tgt) {
      const c = ctx.closes(sym, COIN_MA);
      const coinUp = c.length >= COIN_MA && c.at(-1)! >= sma(c);
      if (!bull || !coinUp || (sig[sym]?.signal ?? 0) < MIN_SIGNAL) tgt[sym] = 0;
    }
    const cur = ctx.weights();
    return Object.fromEntries(ctx.symbols.map((x) => [x, needsTrade(cur[x] ?? 0, tgt[x] ?? 0) ? tgt[x] ?? 0 : cur[x] ?? 0]));
  },
};
export default s;

// r1-crypto-regime: the incumbent Donchian trend ensemble (src/strategy/trend.ts) with a market-regime
// layer on top. Crypto is dominated by one common factor (BTC); when BTC trades below its 100-day SMA the
// market is in a bear / choppy regime where alt breakouts are mostly short-lived bear-market rallies that
// the fast Donchian models buy and then get stopped out of (whipsaw). In that regime we hold no crypto.
// When BTC is above its 100-day SMA, the incumbent's sizing and trade-threshold rules apply unchanged.
import type { Ctx, Strategy } from "../harness.js";
import { DEFAULT_TREND, TrendEngine, needsTrade, targetWeights, type CoinSignal } from "../../strategy/trend.js";

const BTC_MA = 100; // regime filter: BTC close vs its N-day simple moving average

const engines = new Map<string, TrendEngine>();
const s: Strategy = {
  name: "r1-crypto-regime",
  description: "Incumbent Donchian ensemble (5-360d, 25% vol target), gated to zero exposure when BTC closes below its 100-day SMA",
  onBar(ctx: Ctx) {
    const p = { ...DEFAULT_TREND, barsPerYear: ctx.barsPerYear, minHistory: ctx.barsPerYear };
    const sig: Record<string, CoinSignal | null> = {};
    for (const sym of ctx.symbols) {
      let e = engines.get(sym); if (!e) engines.set(sym, (e = new TrendEngine(p)));
      if (ctx.has(sym)) { e.step(ctx.closes(sym, 1)[0]); sig[sym] = e.signal(); } else sig[sym] = null;
    }
    const tgt = targetWeights(sig, p);
    const b = ctx.closes("BTC", BTC_MA);
    const bull = b.length >= BTC_MA && b.at(-1)! >= b.reduce((a, x) => a + x, 0) / b.length;
    if (!bull) for (const sym in tgt) tgt[sym] = 0;
    const cur = ctx.weights();
    return Object.fromEntries(ctx.symbols.map((x) => [x, needsTrade(cur[x] ?? 0, tgt[x] ?? 0) ? tgt[x] ?? 0 : cur[x] ?? 0]));
  },
};
export default s;

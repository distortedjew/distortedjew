// INCUMBENT: the live trend strategy (src/strategy/trend.ts): 9 Donchian breakout models per asset,
// ratcheting mid-channel stops, correlation-aware sizing to a 25% portfolio vol target. Works in both arenas.
import type { Ctx, Strategy } from "../harness.js";
import { DEFAULT_TREND, TrendEngine, needsTrade, targetWeights, type CoinSignal } from "../../strategy/trend.js";

const engines = new Map<string, TrendEngine>();
const s: Strategy = {
  name: "incumbent-trend",
  description: "Donchian ensemble (5-360d) with trailing stops, vol-targeted (25%) correlation-aware sizing, 2%/20% trade threshold",
  onBar(ctx: Ctx) {
    const p = { ...DEFAULT_TREND, barsPerYear: ctx.barsPerYear, minHistory: ctx.barsPerYear };
    const sig: Record<string, CoinSignal | null> = {};
    for (const sym of ctx.symbols) {
      let e = engines.get(sym); if (!e) engines.set(sym, (e = new TrendEngine(p)));
      if (ctx.has(sym)) { e.step(ctx.closes(sym, 1)[0]); sig[sym] = e.signal(); } else sig[sym] = null;
    }
    const tgt = targetWeights(sig, p), cur = ctx.weights();
    // keep current weights unless the change is worth trading (same rule as live)
    return Object.fromEntries(ctx.symbols.map((x) => [x, needsTrade(cur[x] ?? 0, tgt[x] ?? 0) ? tgt[x] ?? 0 : cur[x] ?? 0]));
  },
};
export default s;

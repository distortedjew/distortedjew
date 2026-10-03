// BENCHMARK: 100% in one asset (BTC in crypto, SPY in ETFs).
import type { Ctx, Strategy } from "../harness.js";
const s: Strategy = {
  name: "bench-single",
  description: "Buy and hold BTC (crypto) or SPY (ETF)",
  onBar(ctx: Ctx) { const a = ctx.symbols.includes("BTC") ? "BTC" : "SPY"; return ctx.has(a) ? { [a]: 1 } : null; },
};
export default s;

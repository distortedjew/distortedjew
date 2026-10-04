// BENCHMARK (ETF only): 60% SPY / 40% IEF, monthly rebalance.
import type { Ctx, Strategy } from "../harness.js";
let month = "";
const s: Strategy = {
  name: "bench-etf-6040",
  description: "60% SPY / 40% IEF, monthly rebalance",
  onBar(ctx: Ctx) { if (ctx.date.slice(0, 7) === month) return null; month = ctx.date.slice(0, 7); return { SPY: 0.6, IEF: 0.4 }; },
};
export default s;

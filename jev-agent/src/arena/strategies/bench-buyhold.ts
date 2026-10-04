// BENCHMARK: equal-weight buy and hold of everything available, rebalanced monthly.
import type { Ctx, Strategy } from "../harness.js";
let month = "";
const s: Strategy = {
  name: "bench-buyhold",
  description: "Equal-weight buy and hold of all assets with history, monthly rebalance",
  onBar(ctx: Ctx) {
    if (ctx.date.slice(0, 7) === month) return null;
    month = ctx.date.slice(0, 7);
    const live = ctx.symbols.filter((x) => ctx.has(x) && ctx.closes(x, 252).length >= 252);
    return Object.fromEntries(live.map((x) => [x, 1 / live.length]));
  },
};
export default s;

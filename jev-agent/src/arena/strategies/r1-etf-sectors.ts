// SECTOR MOMENTUM ROTATION (r1-etf-sectors)
// Industry momentum (Moskowitz & Grinblatt 1999): rank the 9 SPDR sector ETFs by medium-term
// momentum (average of 3/6/12-month returns, skipping the latest month), hold the top 3 equally,
// rebalance monthly. A sector with non-positive momentum gets its slot in IEF.
// Regime filter: if SPY closes below its 200-day SMA at the rebalance, hold 100% IEF.
import type { Ctx, Strategy } from "../harness.js";

const SECTORS = ["XLB", "XLE", "XLF", "XLI", "XLK", "XLP", "XLU", "XLV", "XLY"];
const LOOKBACKS = [63, 126, 252]; // 3, 6, 12 months
const SKIP = 21;                  // skip the most recent month (short-term reversal)
const TOPN = 3;
const SMA = 200;                  // SPY regime filter
const DEFENSIVE = "IEF";

const mom = (ctx: Ctx, s: string) => {
  let t = 0;
  for (const L of LOOKBACKS) {
    const c = ctx.closes(s, L + 1);
    if (c.length < L + 1) return NaN;
    t += c[c.length - 1 - SKIP] / c[0] - 1;
  }
  return t / LOOKBACKS.length;
};

let month = "";
const s: Strategy = {
  name: "r1-etf-sectors",
  description: "Top 3 SPDR sectors by avg 3/6/12-1 month momentum (abs>0), monthly; SPY<200d SMA -> IEF",
  onBar(ctx: Ctx) {
    const m = ctx.date.slice(0, 7);
    if (m === month) return null;
    month = m;
    const w: Record<string, number> = {};
    const spy = ctx.closes("SPY", SMA);
    const riskOn = spy.length >= SMA && spy[spy.length - 1] > spy.reduce((a, b) => a + b, 0) / spy.length;
    if (!riskOn) return { [DEFENSIVE]: 1 };
    const ranked = SECTORS.map((x) => ({ x, r: mom(ctx, x) }))
      .filter((o) => Number.isFinite(o.r))
      .sort((a, b) => b.r - a.r)
      .slice(0, TOPN);
    for (const o of ranked) {
      if (o.r > 0) w[o.x] = 1 / TOPN;
      else w[DEFENSIVE] = (w[DEFENSIVE] ?? 0) + 1 / TOPN;
    }
    if (ranked.length < TOPN) w[DEFENSIVE] = (w[DEFENSIVE] ?? 0) + (TOPN - ranked.length) / TOPN;
    return w;
  },
};
export default s;

// r2-etf-blend: fixed 50/50 blend of two different return engines.
//   Sleeve 1: r1-etf-volmanaged (volatility timing: SPY scaled by 1/realized vol + trend-filtered IEF/TLT/GLD hedge).
//   Sleeve 2: r1-etf-dualmom (momentum rotation: 50% GEM + 50% DAA, monthly).
// Both sleeves are called every day (so their own state stays exactly as standalone). Each sleeve keeps a
// *virtual* book: its last non-null targets, drifted with daily close-to-close returns. volmanaged reads that
// virtual book through ctx.weights() so its own 5% band behaves as it would standalone (not against the blend).
// The blend nets both books (w = a*S1 + (1-a)*S2) and only trades when some weight is more than BAND away
// from the actual portfolio, then rebalances fully to the netted target.
import type { Ctx, Strategy } from "../harness.js";
import volmanaged from "./r1-etf-volmanaged.js";
import dualmom from "./r1-etf-dualmom.js";

type W = Record<string, number>;
const P = {
  wVol: 0.5,   // a priori weight on the volmanaged sleeve (dualmom gets 1 - wVol)
  band: 0.03,  // no-trade band on the netted portfolio (abs weight)
};

export function makeBlend(sleeves: Strategy[], weights: number[], band: number, name = "r2-etf-blend"): Strategy {
  const books: W[] = sleeves.map(() => ({}));
  const live: boolean[] = sleeves.map(() => false);
  const prevClose: Record<string, number> = {};
  return {
    name,
    description: `Fixed-weight blend (${weights.map((x) => x.toFixed(2)).join("/")}) of ${sleeves.map((s) => s.name).join(" + ")}; each sleeve's last targets drift as a virtual book; netted, ${band * 100}% no-trade band`,
    onBar(ctx: Ctx) {
      // 1) drift each virtual book with today's close-to-close returns
      const px: Record<string, number> = {};
      for (const s of ctx.symbols) { const c = ctx.closes(s, 1); if (c.length) px[s] = c[0]; }
      for (const b of books) {
        let inv = 0, grown = 0;
        for (const k in b) { inv += b[k]; const g = prevClose[k] ? px[k] / prevClose[k] : 1; b[k] *= g; grown += b[k]; }
        const tot = grown + (1 - inv);
        if (tot > 0) for (const k in b) b[k] /= tot;
      }
      Object.assign(prevClose, px);
      // 2) run each sleeve on a ctx whose weights() is its own virtual book
      sleeves.forEach((sl, i) => {
        const sub: Ctx = { ...ctx, weights: () => ({ ...books[i] }) };
        const t = sl.onBar(sub);
        if (t) {
          const clean: W = {};
          let sum = 0;
          for (const k in t) if (t[k] > 0) { clean[k] = t[k]; sum += t[k]; }
          if (sum > 1) for (const k in clean) clean[k] /= sum;
          books[i] = clean; live[i] = true;
        }
      });
      if (!live.every(Boolean)) return null;
      // 3) net the books and apply the no-trade band against the real portfolio
      const tgt: W = {};
      books.forEach((b, i) => { for (const k in b) tgt[k] = (tgt[k] ?? 0) + weights[i] * b[k]; });
      const cur = ctx.weights();
      let maxDiff = 0;
      for (const k of new Set([...Object.keys(tgt), ...Object.keys(cur)])) maxDiff = Math.max(maxDiff, Math.abs((tgt[k] ?? 0) - (cur[k] ?? 0)));
      return maxDiff < band ? null : tgt;
    },
  };
}

export default makeBlend([volmanaged, dualmom], [P.wVol, 1 - P.wVol], P.band);

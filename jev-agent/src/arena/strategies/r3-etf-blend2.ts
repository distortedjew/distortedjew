// r3-etf-blend2: fixed 50/50 blend of the two best-scoring, structurally different ETF return engines.
//   Sleeve 1 (volatility timing): r2-etf-champplus — SPY+QQQ basket sized by 0.6*16%/20d realized vol
//     (Moreira & Muir 2017), rest in trend-filtered inverse-vol IEF/TLT/GLD, else SHY; 5% sleeve band.
//   Sleeve 2 (momentum rotation): r1-etf-dualmom — 50% GEM (Antonacci) + 50% DAA (Keller & Keuning), monthly.
// Rationale: the two engines draw on different, individually documented premia (volatility clustering vs.
// cross-sectional/time-series momentum) and rebalance on different clocks, so their active returns are only
// partly correlated; a fixed a-priori 50/50 mix should raise Sharpe and lower dependence on either engine's
// parameters (e.g. dualmom's lookback month length). Weights are not optimised.
// Mechanics (copied from r2-etf-blend): every sleeve is called every day so its state is exactly as standalone.
// Each sleeve keeps a *virtual* book (its last non-null targets drifted with close-to-close returns) and sees
// that book via ctx.weights(), so its own band acts as standalone. The blend nets the books and only trades
// when some netted weight is more than BAND away from the actual portfolio, then rebalances to the target.
// Research-only env overrides (defaults are the submitted configuration): R3_WVOL, R3_BAND, R3_M (dualmom
// month length, uses an in-file parametrised copy of dualmom identical to the original at M=21).
import type { Ctx, Strategy } from "../harness.js";
import champplus from "./r2-etf-champplus.js";
import dualmom from "./r1-etf-dualmom.js";

type W = Record<string, number>;
const env = (k: string, d: number) => (process.env[k] !== undefined ? Number(process.env[k]) : d);
const P = {
  wVol: env("R3_WVOL", 0.5), // a priori weight on the champplus sleeve (dualmom gets 1 - wVol)
  band: env("R3_BAND", 0.03), // no-trade band on the netted portfolio (abs weight)
};

function makeBlend(sleeves: Strategy[], weights: number[], band: number, name: string): Strategy {
  const books: W[] = sleeves.map(() => ({}));
  const live: boolean[] = sleeves.map(() => false);
  const prevClose: Record<string, number> = {};
  return {
    name,
    description: `Fixed-weight blend (${weights.map((x) => x.toFixed(2)).join("/")}) of ${sleeves.map((s) => s.name).join(" + ")}; per-sleeve virtual books, netted, ${band * 100}% no-trade band`,
    onBar(ctx: Ctx) {
      const px: Record<string, number> = {};
      for (const s of ctx.symbols) { const c = ctx.closes(s, 1); if (c.length) px[s] = c[0]; }
      for (const b of books) {
        let inv = 0, grown = 0;
        for (const k in b) { inv += b[k]; const g = prevClose[k] ? px[k] / prevClose[k] : 1; b[k] *= g; grown += b[k]; }
        const tot = grown + (1 - inv);
        if (tot > 0) for (const k in b) b[k] /= tot;
      }
      Object.assign(prevClose, px);
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
      const tgt: W = {};
      books.forEach((b, i) => { for (const k in b) tgt[k] = (tgt[k] ?? 0) + weights[i] * b[k]; });
      const cur = ctx.weights();
      let maxDiff = 0;
      for (const k of new Set([...Object.keys(tgt), ...Object.keys(cur)])) maxDiff = Math.max(maxDiff, Math.abs((tgt[k] ?? 0) - (cur[k] ?? 0)));
      return maxDiff < band ? null : tgt;
    },
  };
}

// Parametrised copy of r1-etf-dualmom (research only, for the lookback-fragility check).
function makeDualMom(M: number): Strategy {
  const LB = [1, 3, 6, 12].map((k) => k * M);
  const GEM_RISKY = ["SPY", "EFA"], GEM_SAFE = "IEF", CASH = "SHY";
  const DAA_RISKY = ["SPY", "QQQ", "IWM", "EFA", "EEM", "VNQ", "GLD", "TLT", "HYG", "LQD"];
  const DAA_CANARY = ["EEM", "AGG"], DAA_DEF = ["SHY", "IEF", "LQD"], DAA_TOP = 6;
  const ret = (ctx: Ctx, s: string, n: number) => { const c = ctx.closes(s, n + 1); return c.length < n + 1 ? NaN : c[n] / c[0] - 1; };
  const mom = (ctx: Ctx, s: string) => { const [a, b, c, d] = LB.map((n) => ret(ctx, s, n)); return (12 * a + 4 * b + 2 * c + d) / 4; };
  const ranked = (ctx: Ctx, list: string[]) => list.filter((x) => ctx.has(x) && Number.isFinite(mom(ctx, x)))
    .map((x) => [x, mom(ctx, x)] as const).sort((a, b) => b[1] - a[1]);
  let month = "";
  return {
    name: `dualmom-M${M}`, description: "",
    onBar(ctx) {
      const m = ctx.date.slice(0, 7);
      if (m === month) return null;
      const gem = ranked(ctx, GEM_RISKY), risky = ranked(ctx, DAA_RISKY), def = ranked(ctx, DAA_DEF);
      const cash = mom(ctx, CASH);
      if (!gem.length || risky.length < DAA_TOP || !def.length || !Number.isFinite(cash)) return null;
      month = m;
      const w: W = {};
      const add = (k: string, x: number) => { if (x > 0) w[k] = (w[k] ?? 0) + x; };
      add(gem[0][1] > cash ? gem[0][0] : GEM_SAFE, 0.5);
      const bad = DAA_CANARY.filter((c) => !(mom(ctx, c) > 0)).length;
      const defFrac = bad / DAA_CANARY.length;
      for (const [x] of risky.slice(0, DAA_TOP)) add(x, (0.5 * (1 - defFrac)) / DAA_TOP);
      add(def[0][0], 0.5 * defFrac);
      return w;
    },
  };
}

const momSleeve = process.env.R3_M !== undefined ? makeDualMom(Number(process.env.R3_M)) : dualmom;
export default process.env.R3_ONLY === "mom"
  ? momSleeve
  : makeBlend([champplus, momSleeve], [P.wVol, 1 - P.wVol], P.band, "r3-etf-blend2");

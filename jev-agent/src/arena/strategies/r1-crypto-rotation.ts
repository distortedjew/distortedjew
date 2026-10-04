// r1-crypto-rotation: cross-sectional momentum rotation among coins, gated by time-series momentum.
// Evidence: crypto shows strong time-series momentum (Liu & Tsyvinski 2021) and a cross-sectional
// momentum factor (Liu, Tsyvinski & Wu 2022); a BTC trend filter avoids the deep crypto bear markets.
// Rule: weekly, if BTC > 200d SMA, hold up to 3 coins with the highest mean(30d, 90d) return among those
// above their own 100d SMA with positive momentum; each weight = min(1/#picked, (50%/3)/coin's 30d ann. vol).
// Exit to cash immediately (daily check) when the regime/filters leave nothing to hold.
import type { Ctx, Strategy } from "../harness.js";

const P = {
  lookbacks: [30, 90] as number[], // momentum lookbacks (days), averaged
  regimeMA: 200,      // BTC must be above this SMA, else cash
  ownMA: 100,         // coin must be above its own SMA (time-series filter)
  topK: 3,            // hold the strongest K coins
  volLB: 30,          // vol estimation window
  targetVol: 0.5,     // annualised per-portfolio vol target (approx)
  rebalDays: 7,       // rebalance schedule
  minHist: 200,       // bars needed before a coin is eligible
  band: 0.05,         // don't trade weight changes smaller than this
};

let day = 0;
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

function annVol(c: number[], bpy: number) {
  const r: number[] = [];
  for (let i = 1; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1]));
  const m = mean(r);
  return Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(bpy);
}

function target(ctx: Ctx): Record<string, number> {
  const out: Record<string, number> = {};
  const btc = ctx.closes("BTC", P.regimeMA);
  if (btc.length < P.regimeMA || btc.at(-1)! < mean(btc)) return out;
  const maxLB = Math.max(...P.lookbacks, P.ownMA, P.minHist, P.volLB + 1);
  const cands: { s: string; score: number; vol: number }[] = [];
  for (const s of ctx.symbols) {
    if (!ctx.has(s)) continue;
    const c = ctx.closes(s, maxLB + 1);
    if (c.length < maxLB + 1) continue;
    const last = c.at(-1)!;
    if (last < mean(c.slice(-P.ownMA))) continue;
    const score = mean(P.lookbacks.map((lb) => last / c[c.length - 1 - lb] - 1));
    if (score <= 0) continue;
    cands.push({ s, score, vol: annVol(c.slice(-(P.volLB + 1)), ctx.barsPerYear) });
  }
  cands.sort((a, b) => b.score - a.score);
  const pick = cands.slice(0, P.topK);
  if (!pick.length) return out;
  // inverse-vol weights within the picked set, then scale so each slot's vol budget is targetVol/K
  for (const x of pick) out[x.s] = Math.min(1 / pick.length, P.targetVol / P.topK / x.vol);
  return out;
}

const s: Strategy = {
  name: "r1-crypto-rotation",
  description: "Top-3 coins by blended 30/90d momentum, each above own 100d SMA, only when BTC > 200d SMA; vol-capped weights, weekly rebalance",
  onBar(ctx: Ctx) {
    day++;
    const tgt = target(ctx);
    const cur = ctx.weights();
    const regimeOff = Object.keys(tgt).length === 0 && Object.values(cur).some((w) => w > 0.01);
    if (day % P.rebalDays !== 0 && !regimeOff) return null;
    const res: Record<string, number> = {};
    for (const x of ctx.symbols) {
      const t = tgt[x] ?? 0, c = cur[x] ?? 0;
      res[x] = t === 0 || c === 0 || Math.abs(t - c) >= P.band ? t : c;
    }
    return res;
  },
};
export default s;

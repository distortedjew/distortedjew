// r1-crypto-volbreakout: Keltner-channel volatility breakout with ATR chandelier exits.
// Entry: close breaks above EMA(N) + K*ATR(N) while the long-term trend is up (close > SMA(T)).
// Exit: chandelier stop = highest close since entry - M*ATR(N) (ratchets up only).
// Sizing: each position risks ~equal volatility (weight = RISK / ATR%), per-coin cap, portfolio cap.
import type { Ctx, Strategy } from "../harness.js";

const N = 20;        // Keltner EMA / ATR length
const K = 2;         // channel width in ATRs
const M = 3;         // chandelier multiple
const T = 100;       // trend filter SMA length
const RISK = 0.01; // target daily ATR contribution per position (fraction of equity)
const CAP = 0.3;   // per-coin weight cap
const GROSS = 1; // portfolio exposure cap
const BAND = 0.25; // rebalance only if weight drifts by >25% of target

interface St { ema?: number; atr?: number; prevClose?: number; n: number; inPos: boolean; peak: number; stop: number }
const st = new Map<string, St>();

const s: Strategy = {
  name: "r1-crypto-volbreakout",
  description: `Keltner breakout (EMA${N} + ${K}xATR${N}) with SMA${T} trend filter, ${M}xATR chandelier exit, inverse-ATR sizing (${RISK * 100}% daily risk/coin, cap ${CAP}), gross cap ${GROSS}`,
  onBar(ctx: Ctx) {
    const raw: Record<string, number> = {};
    for (const sym of ctx.symbols) {
      let x = st.get(sym); if (!x) st.set(sym, (x = { n: 0, inPos: false, peak: 0, stop: 0 }));
      if (!ctx.has(sym)) { if (x.inPos) raw[sym] = -1; continue; }
      const b = ctx.bars(sym, 1)[0];
      const tr = x.prevClose === undefined ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - x.prevClose), Math.abs(b.low - x.prevClose));
      const a = 2 / (N + 1);
      x.ema = x.ema === undefined ? b.close : x.ema + a * (b.close - x.ema);
      x.atr = x.atr === undefined ? tr : x.atr + (tr - x.atr) / N; // Wilder ATR
      x.prevClose = b.close; x.n++;
      if (x.n < Math.max(T, 2 * N)) continue;
      const closes = ctx.closes(sym, T);
      const sma = closes.reduce((p, c) => p + c, 0) / closes.length;
      const atr = x.atr;
      if (x.inPos) {
        x.peak = Math.max(x.peak, b.close);
        x.stop = Math.max(x.stop, x.peak - M * atr);
        if (b.close < x.stop) x.inPos = false;
      } else if (b.close > x.ema + K * atr && b.close > sma) {
        x.inPos = true; x.peak = b.close; x.stop = b.close - M * atr;
      }
      if (x.inPos) raw[sym] = Math.min(CAP, RISK / (atr / b.close));
    }
    // portfolio cap
    const sum = Object.values(raw).reduce((p, w) => p + Math.max(0, w), 0);
    const scale = sum > GROSS ? GROSS / sum : 1;
    const cur = ctx.weights();
    const out: Record<string, number> = {};
    for (const sym of ctx.symbols) {
      const c = cur[sym] ?? 0;
      if (raw[sym] === -1) { out[sym] = c; continue; } // no bar today: hold
      const t = (raw[sym] ?? 0) * scale;
      if (t === 0) out[sym] = 0;
      else if (c === 0 || Math.abs(t - c) > BAND * t) out[sym] = t;
      else out[sym] = c;
    }
    return out;
  },
};
export default s;

import type { MarketState, Quote, Trade } from "./types.js";

const WINDOW_MS = 60_000;

/** Rolling per-symbol market memory that turns raw ticks into the compact state Jev is asked about. */
export class SymbolBook {
  quote?: Quote;
  private mids: { ts: number; mid: number }[] = [];
  private trades: Trade[] = [];
  constructor(readonly symbol: string, private horizonSec: number) {}

  onQuote(q: Quote) {
    this.quote = q;
    this.mids.push({ ts: q.ts, mid: (q.bid + q.ask) / 2 });
    const cut = q.ts - WINDOW_MS - 5_000;
    while (this.mids.length && this.mids[0].ts < cut) this.mids.shift();
  }
  onTrade(t: Trade) {
    this.trades.push(t);
    const cut = t.ts - this.horizonSec * 1000;
    while (this.trades.length && this.trades[0].ts < cut) this.trades.shift();
  }

  private ret(sec: number, now: number, mid: number) {
    const target = now - sec * 1000;
    const past = this.mids.find((m) => m.ts >= target);
    return past ? ((mid - past.mid) / past.mid) * 1e4 : 0;
  }

  /** null until there is enough history to say anything. */
  state(position: { qty: number; avgPx: number }): MarketState | null {
    const q = this.quote;
    if (!q || this.mids.length < 10 || q.ts - this.mids[0].ts < 5_000) return null;
    const mid = (q.bid + q.ask) / 2;
    let buyVol = 0, sellVol = 0;
    for (const t of this.trades) t.side === "buy" ? (buyVol += t.size) : (sellVol += t.size);
    const sz = q.bidSize + q.askSize;
    const usd = position.qty * mid;
    return {
      symbol: this.symbol,
      horizonSec: this.horizonSec,
      mid,
      spreadBps: ((q.ask - q.bid) / mid) * 1e4,
      bookImbalance: sz ? (q.bidSize - q.askSize) / sz : 0,
      returnsBps: { last5s: this.ret(5, q.ts, mid), last15s: this.ret(15, q.ts, mid), last60s: this.ret(60, q.ts, mid) },
      trades: { count: this.trades.length, buyVol, sellVol, cvd: buyVol - sellVol, lastSide: this.trades.at(-1)?.side ?? null },
      position: {
        side: position.qty > 0 ? "long" : "flat",
        usd,
        unrealizedBps: position.qty > 0 && position.avgPx > 0 ? ((mid - position.avgPx) / position.avgPx) * 1e4 : 0,
      },
    };
  }
}

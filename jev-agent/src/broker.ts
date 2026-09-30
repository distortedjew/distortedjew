import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Broker, Fill, Quote } from "./types.js";

/** Simulated spot account: market orders cross the spread, pay slippage and a taker fee. */
export class PaperBroker implements Broker {
  private cashUsd: number;
  private pos = new Map<string, number>();
  readonly fills: Fill[] = [];
  /** With `statePath`, cash and positions survive restarts (a daily strategy holds for days). */
  constructor(startCash: number, private feeBps: number, private slipBps: number, private statePath?: string) {
    this.cashUsd = startCash;
    if (statePath && existsSync(statePath)) {
      const s = JSON.parse(readFileSync(statePath, "utf8"));
      this.cashUsd = s.cash; this.pos = new Map(Object.entries(s.positions));
    }
  }
  private save() {
    if (this.statePath) writeFileSync(this.statePath, JSON.stringify({ cash: this.cashUsd, positions: Object.fromEntries(this.pos) }));
  }

  submit(symbol: string, side: "buy" | "sell", usd: number, q: Quote): Fill | null {
    const slip = this.slipBps / 1e4;
    const price = side === "buy" ? q.ask * (1 + slip) : q.bid * (1 - slip);
    let qty = usd / price;
    if (side === "sell") qty = Math.min(qty, this.positionQty(symbol));
    else qty = Math.min(qty, this.cashUsd / (price * (1 + this.feeBps / 1e4)));
    if (qty <= 0) return null;
    const notional = qty * price, fee = notional * (this.feeBps / 1e4);
    this.cashUsd += side === "buy" ? -(notional + fee) : notional - fee;
    this.pos.set(symbol, this.positionQty(symbol) + (side === "buy" ? qty : -qty));
    const fill: Fill = { symbol, side, qty, price, fee, ts: Date.now() };
    this.fills.push(fill);
    this.save();
    return fill;
  }
  positionQty(symbol: string) { return this.pos.get(symbol) ?? 0; }
  cash() { return this.cashUsd; }
  equity(marks: Record<string, number>) {
    let e = this.cashUsd;
    for (const [s, q] of this.pos) e += q * (marks[s] ?? 0);
    return e;
  }
}

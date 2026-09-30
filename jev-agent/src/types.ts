export type Action = "buy" | "sell" | "hold";

export interface Quote { symbol: string; ts: number; bid: number; ask: number; bidSize: number; askSize: number }
export interface Trade { symbol: string; ts: number; price: number; size: number; side: "buy" | "sell" }

/** What the model sees. Compact and relative so it generalises across symbols. */
export interface MarketState {
  symbol: string;
  horizonSec: number;
  mid: number;
  spreadBps: number;
  bookImbalance: number; // -1 (all ask size) .. 1 (all bid size) at the touch
  returnsBps: { last5s: number; last15s: number; last60s: number };
  trades: { count: number; buyVol: number; sellVol: number; cvd: number; lastSide: "buy" | "sell" | null };
  position: { side: "long" | "flat"; usd: number; unrealizedBps: number };
}

export interface Decision {
  action: Action;
  confidence: number; // probability of the chosen side
  probabilities: { buy: number; sell: number };
  latencyMs: number;
}

export interface Model { readonly name: string; decide(state: MarketState): Promise<Decision> }

export interface Fill { symbol: string; side: "buy" | "sell"; qty: number; price: number; fee: number; ts: number }

export interface Broker {
  /** Market-order `usd` notional of `symbol` on `side`, filled against `quote`. */
  submit(symbol: string, side: "buy" | "sell", usd: number, quote: Quote): Fill | null;
  positionQty(symbol: string): number;
  equity(marks: Record<string, number>): number;
  cash(): number;
}

export interface Feed {
  on(cb: (e: { type: "quote"; q: Quote } | { type: "trade"; t: Trade }) => void): void;
  start(): Promise<void>;
  stop(): void;
}

import WebSocket from "ws";
import type { Feed, Quote, Trade } from "./types.js";

type Cb = (e: { type: "quote"; q: Quote } | { type: "trade"; t: Trade }) => void;

/** Binance public websocket: best bid/ask + aggregate trades. No API key needed. Reconnects forever. */
export class BinanceFeed implements Feed {
  private cbs: Cb[] = [];
  private ws?: WebSocket;
  private stopped = false;
  constructor(private symbols: string[], private baseUrl = "wss://stream.binance.com:9443") {}
  on(cb: Cb) { this.cbs.push(cb); }
  private emit(e: Parameters<Cb>[0]) { for (const cb of this.cbs) cb(e); }

  async start() { this.connect(); }
  stop() { this.stopped = true; this.ws?.close(); }

  private connect() {
    const streams = this.symbols.flatMap((s) => [`${s.toLowerCase()}@bookTicker`, `${s.toLowerCase()}@aggTrade`]);
    const ws = (this.ws = new WebSocket(`${this.baseUrl}/stream?streams=${streams.join("/")}`));
    ws.on("message", (raw) => {
      const { data: d } = JSON.parse(raw.toString());
      if (d.e === "aggTrade") {
        // m = buyer is the maker, so the taker sold.
        this.emit({ type: "trade", t: { symbol: d.s, ts: d.T, price: +d.p, size: +d.q, side: d.m ? "sell" : "buy" } });
      } else if (d.b !== undefined) {
        this.emit({ type: "quote", q: { symbol: d.s, ts: Date.now(), bid: +d.b, ask: +d.a, bidSize: +d.B, askSize: +d.A } });
      }
    });
    // Binance drops connections every 24h; also recover from network blips.
    ws.on("close", () => { if (!this.stopped) setTimeout(() => this.connect(), 1000); });
    ws.on("error", (e) => { console.error("feed error", e.message); ws.close(); });
  }
}

/** Random-walk market with a little flow persistence so a model has something to find. For tests and dry runs. */
export class SimFeed implements Feed {
  private cbs: Cb[] = [];
  private timer?: NodeJS.Timeout;
  private px: Record<string, number>;
  private flow: Record<string, number> = {};
  constructor(private symbols: string[], private tickMs = 100) {
    this.px = Object.fromEntries(symbols.map((s, i) => [s, 100 * (i + 1)]));
  }
  on(cb: Cb) { this.cbs.push(cb); }
  private emit(e: Parameters<Cb>[0]) { for (const cb of this.cbs) cb(e); }
  async start() {
    this.timer = setInterval(() => {
      for (const s of this.symbols) {
        const f = (this.flow[s] = (this.flow[s] ?? 0) * 0.95 + (Math.random() - 0.5));
        this.px[s] *= 1 + f * 0.0002 + (Math.random() - 0.5) * 0.0004;
        const mid = this.px[s], half = mid * 0.00005;
        const imb = Math.tanh(f);
        this.emit({ type: "quote", q: { symbol: s, ts: Date.now(), bid: mid - half, ask: mid + half, bidSize: 10 * (1 + imb), askSize: 10 * (1 - imb) } });
        this.emit({ type: "trade", t: { symbol: s, ts: Date.now(), price: mid, size: Math.random() * 2, side: f + (Math.random() - 0.5) > 0 ? "buy" : "sell" } });
      }
    }, this.tickMs);
  }
  stop() { clearInterval(this.timer); }
}

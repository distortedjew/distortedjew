import WebSocket from "ws";
import type { Broker, Feed, Fill, Quote, Trade } from "./types.js";

const PAPER_API = "https://paper-api.alpaca.markets"; // hard-coded: this agent never talks to a live account
const isCrypto = (s: string) => s.includes("/");
const norm = (s: string) => s.replace("/", "");

type Cb = (e: { type: "quote"; q: Quote } | { type: "trade"; t: Trade }) => void;

/** Alpaca market data websockets: stocks (free IEX feed, market hours) and crypto (24/7). Reconnects forever. */
export class AlpacaFeed implements Feed {
  private cbs: Cb[] = [];
  private socks: WebSocket[] = [];
  private stopped = false;
  private lastMid = new Map<string, number>();
  constructor(private symbols: string[], private keyId: string, private secret: string) {}
  on(cb: Cb) { this.cbs.push(cb); }
  private emit(e: Parameters<Cb>[0]) { for (const cb of this.cbs) cb(e); }

  async start() {
    const stocks = this.symbols.filter((s) => !isCrypto(s)), crypto = this.symbols.filter(isCrypto);
    if (stocks.length) this.connect("wss://stream.data.alpaca.markets/v2/iex", stocks);
    if (crypto.length) this.connect("wss://stream.data.alpaca.markets/v1beta3/crypto/us", crypto);
  }
  stop() { this.stopped = true; this.socks.forEach((s) => s.close()); }

  private connect(url: string, symbols: string[]) {
    const ws = new WebSocket(url);
    this.socks.push(ws);
    ws.on("open", () => ws.send(JSON.stringify({ action: "auth", key: this.keyId, secret: this.secret })));
    ws.on("message", (raw) => {
      for (const m of JSON.parse(raw.toString())) {
        if (m.T === "success" && m.msg === "authenticated") ws.send(JSON.stringify({ action: "subscribe", quotes: symbols, trades: symbols }));
        else if (m.T === "error") console.error("alpaca feed:", m.code, m.msg);
        else if (m.T === "q") {
          if (!(m.bp > 0 && m.ap > 0)) continue;
          this.lastMid.set(m.S, (m.bp + m.ap) / 2);
          this.emit({ type: "quote", q: { symbol: m.S, ts: Date.now(), bid: m.bp, ask: m.ap, bidSize: m.bs, askSize: m.as } });
        } else if (m.T === "t") {
          // Crypto reports the taker side (tks). Stocks don't, so use the tick rule against the last mid.
          const side = m.tks ? (m.tks === "B" ? "buy" : "sell") : m.p >= (this.lastMid.get(m.S) ?? m.p) ? "buy" : "sell";
          this.emit({ type: "trade", t: { symbol: m.S, ts: Date.now(), price: m.p, size: m.s, side } });
        }
      }
    });
    ws.on("close", () => {
      this.socks = this.socks.filter((s) => s !== ws);
      if (!this.stopped) setTimeout(() => this.connect(url, symbols), 2000);
    });
    ws.on("error", (e) => { console.error("alpaca feed error", e.message); ws.close(); });
  }
}

interface Pos { qty: number; avg: number }

/** Alpaca PAPER account. Account/positions are mirrored locally and refreshed every 2 s so the sync Broker interface stays cheap. */
export class AlpacaBroker implements Broker {
  private eq = 0; private cashUsd = 0;
  private pos = new Map<string, Pos>();
  private marketOpen = false;
  lastError = "";
  constructor(private keyId: string, private secret: string) {}

  private async api(method: string, path: string, body?: unknown) {
    const r = await fetch(PAPER_API + path, {
      method,
      headers: { "APCA-API-KEY-ID": this.keyId, "APCA-API-SECRET-KEY": this.secret, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`alpaca ${method} ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.status === 204 ? null : r.json();
  }

  async refresh() {
    const [acct, positions] = await Promise.all([this.api("GET", "/v2/account"), this.api("GET", "/v2/positions")]);
    this.eq = +acct.equity; this.cashUsd = +acct.cash;
    this.pos.clear();
    for (const p of positions) this.pos.set(p.symbol, { qty: +p.qty, avg: +p.avg_entry_price });
  }
  private async refreshClock() { this.marketOpen = (await this.api("GET", "/v2/clock")).is_open; }

  async start() {
    await this.refresh(); await this.refreshClock();
    const safe = (f: () => Promise<void>) => f().catch((e) => { this.lastError = e.message; console.error(e.message); });
    setInterval(() => safe(() => this.refresh()), 2000).unref();
    setInterval(() => safe(() => this.refreshClock()), 30_000).unref();
  }

  async submit(symbol: string, side: "buy" | "sell", usd: number, q: Quote): Promise<Fill | null> {
    const crypto = isCrypto(symbol);
    if (!crypto && !this.marketOpen) return null; // a "day" order now would queue and fill at the next open
    const key = norm(symbol);
    const held = this.pos.get(key);
    const px = side === "buy" ? q.ask : q.bid;
    try {
      let qty = usd / px;
      if (side === "sell" && held && usd >= held.qty * px * 0.98) {
        qty = held.qty;
        await this.api("DELETE", `/v2/positions/${key}`); // closes the whole position cleanly, no dust
      } else {
        await this.api("POST", "/v2/orders", {
          symbol, side, type: "market", notional: usd.toFixed(2), time_in_force: crypto ? "gtc" : "day",
        });
      }
      // Optimistic local update until the next refresh (2 s) reflects the real fill.
      const cur = held ?? { qty: 0, avg: px };
      this.pos.set(key, { qty: cur.qty + (side === "buy" ? qty : -qty), avg: cur.avg });
      return { symbol, side, qty, price: px, fee: 0, ts: Date.now() };
    } catch (e) {
      this.lastError = (e as Error).message;
      console.error(this.lastError);
      return null;
    }
  }
  positionQty(symbol: string) { return this.pos.get(norm(symbol))?.qty ?? 0; }
  avgPrice(symbol: string) { return this.pos.get(norm(symbol))?.avg; }
  cash() { return this.cashUsd; }
  equity() { return this.eq; }
}

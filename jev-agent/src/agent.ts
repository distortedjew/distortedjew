import { appendFileSync, mkdirSync } from "node:fs";
import type { Config } from "./config.js";
import { Risk } from "./risk.js";
import { SymbolBook } from "./state.js";
import type { Broker, Feed, Model } from "./types.js";

const ORDER_USD = (cfg: Config) => cfg.risk.maxPositionUsd / 2;

/**
 * The decision loop. Per symbol: build state -> ask the model -> gate on confidence and staleness
 * -> pass through the risk layer -> execute. One in-flight model call per symbol; ticks that arrive
 * while a call is pending just update the book, so we always decide on the freshest data.
 */
export class Agent {
  private books = new Map<string, SymbolBook>();
  private busy = new Set<string>();
  private lastDecide = new Map<string, number>();
  private avgPx = new Map<string, number>();
  private marks: Record<string, number> = {};
  readonly risk: Risk;
  stats = { decisions: 0, late: 0, orders: 0, blocked: 0, errors: 0 };

  constructor(private cfg: Config, private model: Model, private broker: Broker, private feed: Feed, private logPath = "logs/decisions.jsonl") {
    this.risk = new Risk(cfg.risk);
    for (const s of cfg.symbols) this.books.set(s, new SymbolBook(s, cfg.horizonSec));
    mkdirSync("logs", { recursive: true });
    feed.on((e) => {
      if (e.type === "trade") this.books.get(e.t.symbol)?.onTrade(e.t);
      else {
        this.books.get(e.q.symbol)?.onQuote(e.q);
        this.marks[e.q.symbol] = (e.q.bid + e.q.ask) / 2;
        void this.tick(e.q.symbol);
      }
    });
  }

  private log(rec: object) { appendFileSync(this.logPath, JSON.stringify({ t: new Date().toISOString(), ...rec }) + "\n"); }

  private async tick(symbol: string) {
    const now = Date.now();
    if (this.busy.has(symbol) || now - (this.lastDecide.get(symbol) ?? 0) < this.cfg.decideEveryMs) return;
    const book = this.books.get(symbol)!;
    const qty = this.broker.positionQty(symbol);
    const state = book.state({ qty, avgPx: this.avgPx.get(symbol) ?? 0 });
    if (!state || !book.quote) return;

    // Kill switch: flatten everything, then only monitor.
    if (this.risk.shouldFlatten(this.broker.equity(this.marks)) && qty > 0) {
      this.execute(symbol, "sell", qty * state.mid, "kill-switch");
      return;
    }

    this.busy.add(symbol);
    this.lastDecide.set(symbol, now);
    try {
      const d = await this.model.decide(state);
      this.stats.decisions++;
      if (d.latencyMs > this.cfg.maxLatencyMs) { this.stats.late++; this.log({ symbol, skip: "late", latencyMs: d.latencyMs }); return; }
      if (d.confidence < this.cfg.minConfidence) { this.log({ symbol, skip: "low-confidence", d }); return; }
      // execute() fills against the *current* quote, not the one the decision was based on.
      this.execute(symbol, d.action === "buy" ? "buy" : "sell", ORDER_USD(this.cfg), "model", d);
    } catch (e) {
      this.stats.errors++;
      this.log({ symbol, error: (e as Error).message });
    } finally {
      this.busy.delete(symbol);
    }
  }

  private execute(symbol: string, side: "buy" | "sell", usd: number, why: string, d?: unknown) {
    const q = this.books.get(symbol)!.quote!;
    const qty = this.broker.positionQty(symbol);
    const view = { symbolUsd: qty * ((q.bid + q.ask) / 2), totalUsd: this.totalUsd(), equity: this.broker.equity(this.marks) };
    const r = this.risk.check({ symbol, side, usd }, view);
    if (!r.order) { this.stats.blocked++; this.log({ symbol, side, blocked: r.reason, why }); return null; }
    const fill = this.broker.submit(symbol, side, r.order.usd, q);
    if (!fill) return null;
    this.stats.orders++;
    const prevQty = qty;
    if (side === "buy") {
      const prevAvg = this.avgPx.get(symbol) ?? 0;
      this.avgPx.set(symbol, (prevAvg * prevQty + fill.price * fill.qty) / (prevQty + fill.qty));
    } else if (this.broker.positionQty(symbol) <= 1e-12) this.avgPx.delete(symbol);
    this.log({ symbol, fill, why, decision: d, equity: this.broker.equity(this.marks), stats: this.stats });
    return fill;
  }

  private totalUsd() {
    let t = 0;
    for (const s of this.cfg.symbols) t += this.broker.positionQty(s) * (this.marks[s] ?? 0);
    return t;
  }

  summary() {
    const equity = this.broker.equity(this.marks);
    return { equity: +equity.toFixed(2), pnl: +(equity - this.cfg.startCash).toFixed(2), halted: this.risk.halted, ...this.stats };
  }

  /** UTC-midnight reset of the daily loss limit. */
  scheduleDayReset() {
    const next = new Date(); next.setUTCHours(24, 0, 0, 0);
    setTimeout(() => { this.risk.resetDay(); this.scheduleDayReset(); }, next.getTime() - Date.now()).unref();
  }

  async start() { this.scheduleDayReset(); await this.feed.start(); }
  stop() { this.feed.stop(); }
}

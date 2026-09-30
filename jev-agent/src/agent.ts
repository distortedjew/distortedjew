import { appendFileSync, mkdirSync } from "node:fs";
import type { Config } from "./config.js";
import { Risk } from "./risk.js";
import { SymbolBook } from "./state.js";
import { Telemetry } from "./telemetry.js";
import type { Broker, Feed, Model } from "./types.js";

const ORDER_USD = (cfg: Config) => cfg.risk.maxPositionUsd / 2;

/**
 * The decision loop. Per symbol: build state -> ask the model -> gate on confidence and staleness
 * -> pass through the risk layer -> execute. One in-flight step per symbol; ticks that arrive
 * while one is pending just update the book, so we always decide on the freshest data.
 */
export class Agent {
  private books = new Map<string, SymbolBook>();
  private busy = new Set<string>();
  private lastDecide = new Map<string, number>();
  private avgPx = new Map<string, number>();
  private marks: Record<string, number> = {};
  readonly risk: Risk;
  readonly tel = new Telemetry();
  stats = { decisions: 0, late: 0, orders: 0, blocked: 0, errors: 0 };

  constructor(private cfg: Config, private model: Model, private broker: Broker, private feed: Feed, private logPath = "logs/decisions.jsonl") {
    this.risk = new Risk(cfg.risk);
    for (const s of cfg.symbols) this.books.set(s, new SymbolBook(s, cfg.horizonSec));
    mkdirSync("logs", { recursive: true });
    feed.on((e) => {
      if (e.type === "trade") this.books.get(e.t.symbol)?.onTrade(e.t);
      else {
        this.books.get(e.q.symbol)?.onQuote(e.q);
        const mid = (e.q.bid + e.q.ask) / 2;
        this.marks[e.q.symbol] = mid;
        this.tel.addPrice(e.q.symbol, mid);
        void this.tick(e.q.symbol);
      }
    });
  }

  get modelName() { return this.model.name; }

  private log(rec: object) { appendFileSync(this.logPath, JSON.stringify({ t: new Date().toISOString(), ...rec }) + "\n"); }
  private equity() { return this.broker.equity(this.marks); }
  private avg(symbol: string) { return this.broker.avgPrice?.(symbol) ?? this.avgPx.get(symbol) ?? 0; }

  private async tick(symbol: string) {
    const now = Date.now();
    if (this.busy.has(symbol) || now - (this.lastDecide.get(symbol) ?? 0) < this.cfg.decideEveryMs) return;
    const book = this.books.get(symbol)!;
    const qty = this.broker.positionQty(symbol);
    const state = book.state({ qty, avgPx: this.avg(symbol) });
    if (!state || !book.quote) return;

    this.busy.add(symbol);
    this.lastDecide.set(symbol, now);
    try {
      // Kill switch: flatten everything, then only monitor.
      if (this.risk.shouldFlatten(this.equity())) {
        if (qty > 0) {
          this.tel.addEvent({ kind: "kill", symbol, text: "daily loss limit hit: flattening" });
          await this.execute(symbol, "sell", qty * state.mid, "kill-switch");
        }
        return;
      }
      const d = await this.model.decide(state);
      this.stats.decisions++;
      this.tel.addDecision(symbol, d);
      if (d.latencyMs > this.cfg.maxLatencyMs) {
        this.stats.late++;
        this.tel.addEvent({ kind: "skip", symbol, text: `stale decision (${Math.round(d.latencyMs)} ms)` });
        this.log({ symbol, skip: "late", latencyMs: d.latencyMs });
        return;
      }
      if (d.confidence < this.cfg.minConfidence) { this.log({ symbol, skip: "low-confidence", d }); return; }
      await this.execute(symbol, d.action === "buy" ? "buy" : "sell", ORDER_USD(this.cfg), "model", d);
    } catch (e) {
      this.stats.errors++;
      this.tel.addEvent({ kind: "error", symbol, text: (e as Error).message });
      this.log({ symbol, error: (e as Error).message });
    } finally {
      this.busy.delete(symbol);
    }
  }

  private async execute(symbol: string, side: "buy" | "sell", usd: number, why: string, d?: unknown) {
    // Fills against the *current* quote, not the one the decision was based on.
    const q = this.books.get(symbol)!.quote!;
    const qty = this.broker.positionQty(symbol);
    const view = { symbolUsd: qty * ((q.bid + q.ask) / 2), totalUsd: this.totalUsd(), equity: this.equity() };
    const r = this.risk.check({ symbol, side, usd }, view);
    if (!r.order) {
      this.stats.blocked++;
      // "nothing to sell" is the model saying bearish while flat: routine, not worth a dashboard line.
      if (!r.reason?.startsWith("nothing to sell")) this.tel.addEvent({ kind: "blocked", symbol, side, text: r.reason ?? "blocked" });
      this.log({ symbol, side, blocked: r.reason, why });
      return null;
    }
    const fill = await this.broker.submit(symbol, side, r.order.usd, q);
    if (!fill) {
      this.tel.addEvent({ kind: "skip", symbol, side, text: "broker declined the order (market closed?)" });
      return null;
    }
    this.stats.orders++;
    if (side === "buy") {
      const prevAvg = this.avgPx.get(symbol) ?? 0;
      this.avgPx.set(symbol, (prevAvg * qty + fill.price * fill.qty) / (qty + fill.qty));
    } else if (this.broker.positionQty(symbol) <= 1e-9) this.avgPx.delete(symbol);
    this.tel.addEvent({ kind: "fill", symbol, side, text: `${side} ${fill.qty.toPrecision(4)} @ ${fill.price.toFixed(2)} ($${r.order.usd.toFixed(0)}) [${why}]` });
    this.log({ symbol, fill, why, decision: d, equity: this.equity(), stats: this.stats });
    return fill;
  }

  private totalUsd() {
    let t = 0;
    for (const s of this.cfg.symbols) t += this.broker.positionQty(s) * (this.marks[s] ?? 0);
    return t;
  }

  summary() {
    const equity = this.equity();
    return { equity: +equity.toFixed(2), pnl: +(equity - this.cfg.startCash).toFixed(2), halted: this.risk.halted, ...this.stats };
  }

  /** Everything the dashboard renders, in one JSON-able object. */
  snapshot() {
    const t = this.tel;
    const equity = this.equity();
    const positions = this.cfg.symbols.map((s) => {
      const qty = this.broker.positionQty(s), mid = this.marks[s] ?? 0, avg = this.avg(s);
      return { symbol: s, qty, usd: qty * mid, avgPx: avg, mid, pnlBps: qty > 0 && avg > 0 ? ((mid - avg) / avg) * 1e4 : 0 };
    });
    return {
      now: Date.now(),
      uptimeSec: Math.round((Date.now() - t.startedAt) / 1000),
      mode: "PAPER",
      model: this.model.name, feed: this.cfg.feed, broker: this.cfg.broker,
      config: { minConfidence: this.cfg.minConfidence, horizonSec: this.cfg.horizonSec, ...this.cfg.risk },
      equity, startCash: this.cfg.startCash, pnl: equity - this.cfg.startCash, cash: this.broker.cash(),
      exposure: this.totalUsd(),
      halted: this.risk.halted,
      stats: this.stats,
      latency: { p50: t.pct(0.5), p95: t.pct(0.95) },
      mix: t.decisionMix,
      equitySeries: t.equity.filter((_, i, a) => a.length < 600 || i % Math.ceil(a.length / 600) === 0),
      positions,
      prices: Object.fromEntries([...t.prices].map(([k, v]) => [k, v.map((x) => x[1])])),
      decisions: [...t.lastDecision.values()].map((r) => ({ symbol: r.symbol, ts: r.ts, action: r.d.action, confidence: r.d.confidence, buy: r.d.probabilities.buy, sell: r.d.probabilities.sell, latencyMs: r.d.latencyMs })),
      events: t.events.slice(-60).reverse(),
    };
  }

  /** UTC-midnight reset of the daily loss limit. */
  scheduleDayReset() {
    const next = new Date(); next.setUTCHours(24, 0, 0, 0);
    setTimeout(() => { this.risk.resetDay(); this.scheduleDayReset(); }, next.getTime() - Date.now()).unref();
  }

  async start() {
    this.scheduleDayReset();
    setInterval(() => this.tel.addEquity(this.equity()), 1000).unref();
    await this.feed.start();
  }
  stop() { this.feed.stop(); }
}

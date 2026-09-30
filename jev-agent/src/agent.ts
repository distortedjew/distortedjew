import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";

const MAX_LOG_BYTES = 50 * 1024 * 1024; // keeps at most ~100 MB on disk (current + .1)
import type { Config } from "./config.js";
import { Risk } from "./risk.js";
import { SymbolBook } from "./state.js";
import { Telemetry } from "./telemetry.js";
import type { Strategist } from "./strategist.js";
import type { Broker, Feed, MarketState, Model } from "./types.js";

const ORDER_USD = (cfg: Config) => cfg.risk.maxPositionUsd / 2;

/**
 * The decision loop. One in-flight step per symbol; ticks that arrive while one is pending just
 * update the book, so we always decide on the freshest data.
 *
 * With a strategist (slow LLM, every few minutes) the layers are:
 *   strategist plan  -> which symbols may be held, how much, stop-loss / take-profit / max hold
 *   rule exits       -> stop-loss, take-profit, strategist turned flat, max hold (no model needed)
 *   Jev (fast)       -> times entries inside the plan, and early exits when it is very sure
 *   risk layer       -> hard caps that nothing above can override
 * Without one, Jev alone decides buy/sell (the original behaviour, used for stocks).
 */
export class Agent {
  private books = new Map<string, SymbolBook>();
  private busy = new Set<string>();
  private lastDecide = new Map<string, number>();
  private avgPx = new Map<string, number>();
  private entryTs = new Map<string, number>();
  private exitTs = new Map<string, number>(); // no re-entry right after an exit: stops stop-loss churn
  strategist?: Strategist;
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
        this.tel.scoreMature(e.q.symbol, mid);
        void this.tick(e.q.symbol);
      }
    });
  }

  get modelName() { return this.model.name; }

  private logWrites = 0;
  private log(rec: object) {
    // Always-on process: rotate instead of filling the VPS disk.
    if (++this.logWrites % 1000 === 0) {
      try { if (statSync(this.logPath).size > MAX_LOG_BYTES) renameSync(this.logPath, this.logPath + ".1"); } catch {}
    }
    appendFileSync(this.logPath, JSON.stringify({ t: new Date().toISOString(), ...rec }) + "\n");
  }
  private equity() { return this.broker.equity(this.marks); }
  private avg(symbol: string) { return this.broker.avgPrice?.(symbol) ?? this.avgPx.get(symbol) ?? 0; }

  private async tick(symbol: string) {
    const now = Date.now();
    if (this.busy.has(symbol) || now - (this.lastDecide.get(symbol) ?? 0) < this.cfg.decideEveryMs) return;
    const book = this.books.get(symbol)!;
    const qty = this.broker.positionQty(symbol);
    const state = book.state({ qty, avgPx: this.avg(symbol) });
    if (!state || !book.quote) return;

    const st = this.strategist;
    const plan = st?.plan(symbol);
    if (st) state.plan = plan ? { bias: plan.bias, conviction: plan.conviction, reason: plan.reason } : { bias: "none" };
    if (qty > 0 && !this.entryTs.has(symbol)) this.entryTs.set(symbol, now); // e.g. a position from before a restart
    if (qty <= 0) this.entryTs.delete(symbol);

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
      if (st && qty > 0) {
        const why = this.ruleExit(symbol, state);
        if (why) { await this.execute(symbol, "sell", state.position.usd, why); return; }
      }
      // With a strategist, Jev is only consulted when there's something it could do.
      const cooling = now - (this.exitTs.get(symbol) ?? 0) < this.cfg.reentryCooldownMin * 60_000;
      const canEnter = !!plan && plan.bias === "long" && plan.conviction >= this.cfg.strategist.minConviction && !cooling;
      if (st && qty <= 0 && !canEnter) return;

      const d = await this.model.decide(state);
      this.stats.decisions++;
      this.tel.addDecision(symbol, d);
      this.tel.scoreOpen(symbol, state.mid, d, this.cfg.horizonSec, this.cfg.minConfidence);
      if (d.latencyMs > this.cfg.maxLatencyMs) {
        this.stats.late++;
        this.tel.addEvent({ kind: "skip", symbol, text: `stale decision (${Math.round(d.latencyMs)} ms)` });
        this.log({ symbol, skip: "late", latencyMs: d.latencyMs });
        return;
      }
      if (!st) {
        if (d.confidence < this.cfg.minConfidence) { this.log({ symbol, skip: "low-confidence", d }); return; }
        await this.execute(symbol, d.action === "buy" ? "buy" : "sell", ORDER_USD(this.cfg), "model", d);
        return;
      }
      if (d.action === "buy" && canEnter && d.confidence >= this.cfg.minConfidence) {
        // Scale in toward the strategist's target size, one chunk at a time.
        const room = this.cfg.risk.maxPositionUsd * plan!.size - state.position.usd;
        const usd = Math.min(room, ORDER_USD(this.cfg));
        if (usd >= this.cfg.risk.minOrderUsd) await this.execute(symbol, "buy", usd, "jev-entry", d);
      } else if (d.action === "sell" && qty > 0 && d.confidence >= this.cfg.exitConfidence
        && now - (this.entryTs.get(symbol) ?? now) >= this.cfg.minHoldSec * 1000) {
        await this.execute(symbol, "sell", state.position.usd, "jev-exit", d);
      }
    } catch (e) {
      this.stats.errors++;
      this.tel.addEvent({ kind: "error", symbol, text: (e as Error).message });
      this.log({ symbol, error: (e as Error).message });
    } finally {
      this.busy.delete(symbol);
    }
  }

  /** Exits that need no model: the strategist's stop-loss, take-profit, flat call and max hold. */
  private ruleExit(symbol: string, s: MarketState): string | null {
    const p = this.strategist?.lastPlan(symbol);
    const pnlPct = s.position.unrealizedBps / 100;
    const stop = p?.stopLossPct ?? 1.5, take = p?.takeProfitPct ?? 3;
    if (this.avg(symbol) > 0 && pnlPct <= -stop) return `stop-loss ${pnlPct.toFixed(2)}%`;
    if (this.avg(symbol) > 0 && pnlPct >= take) return `take-profit +${pnlPct.toFixed(2)}%`;
    if (p && p.bias === "flat" && p.expiresAt > Date.now()) return "strategist went flat";
    const heldMin = (Date.now() - (this.entryTs.get(symbol) ?? Date.now())) / 60_000;
    if (p && heldMin > p.maxHoldMin) return `max hold ${Math.round(heldMin)} min`;
    return null;
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
    if (side === "sell") {
      const avg = this.avg(symbol);
      if (avg > 0) this.tel.addTrade(symbol, (fill.price - avg) * fill.qty - fill.fee);
    }
    if (side === "buy") {
      if (qty <= 0) this.entryTs.set(symbol, Date.now());
      const prevAvg = this.avgPx.get(symbol) ?? 0;
      this.avgPx.set(symbol, (prevAvg * qty + fill.price * fill.qty) / (qty + fill.qty));
    } else if (this.broker.positionQty(symbol) <= 1e-9) { this.avgPx.delete(symbol); this.entryTs.delete(symbol); this.exitTs.set(symbol, Date.now()); }
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

  /** What the strategist is told about the agent itself: holdings, limits and how it has been doing. */
  strategistContext() {
    const positions = this.cfg.symbols.map((s) => {
      const qty = this.broker.positionQty(s), mid = this.marks[s] ?? 0, avg = this.avg(s);
      return qty > 0 ? { symbol: s, usd: Math.round(qty * mid), pnlPct: avg ? +(((mid - avg) / avg) * 100).toFixed(2) : null,
        heldMin: Math.round((Date.now() - (this.entryTs.get(s) ?? Date.now())) / 60_000) } : null;
    }).filter(Boolean);
    const perf = Object.fromEntries(this.cfg.symbols.map((s) => {
      const sc = this.tel.score.get(s), tr = this.tel.trades.get(s);
      return [s, {
        fastModelHitRate: sc?.n ? +(sc.hits / sc.n).toFixed(3) : null, fastModelCalls: sc?.n ?? 0,
        closedTrades: tr ? tr.wins + tr.losses : 0, wins: tr?.wins ?? 0, realizedUsd: tr ? +tr.realizedUsd.toFixed(2) : 0,
        previousPlan: this.strategist?.lastPlan(s) ? { bias: this.strategist.lastPlan(s)!.bias, conviction: this.strategist.lastPlan(s)!.conviction } : null,
      }];
    }));
    return {
      mode: "paper", equityUsd: Math.round(this.equity()), cashUsd: Math.round(this.broker.cash()),
      maxPositionUsdPerSymbol: this.cfg.risk.maxPositionUsd, maxTotalExposureUsd: this.cfg.risk.maxTotalExposureUsd,
      dailyLossLimitHit: this.risk.halted, positions, performanceBySymbol: perf,
    };
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
      score: t.scoreTotals(),
      scoreBySymbol: Object.fromEntries([...t.score].map(([k, v]) => [k, v.n ? v.hits / v.n : null])),
      strategist: this.strategist ? {
        ...this.strategist.status, everyMin: this.cfg.strategist.everyMin, minConviction: this.cfg.strategist.minConviction,
        plans: Object.fromEntries(this.cfg.symbols.map((s) => {
          const p = this.strategist!.lastPlan(s);
          return [s, p ? { ...p, active: p.expiresAt > Date.now() } : null];
        })),
      } : null,
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

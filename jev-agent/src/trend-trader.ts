import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Agent } from "./agent.js";
import type { Config } from "./config.js";
import { candles, type DailyBarsOpts } from "./daily-bars.js";
import type { Executor } from "./executor.js";
import type { Notifier } from "./notify.js";
import type { NewsReflex } from "./news-reflex.js";
import type { RiskOfficer } from "./overlay.js";
import { INTERVAL_MS, VARIANTS, applyRegimeFilters, coinSignal, needsTrade, targetWeights, type CoinSignal, type Interval, type TrendParams } from "./strategy/trend.js";

interface ShadowState { cash: number; units: Record<string, number> }
interface Persisted {
  lastRegime?: boolean | null;      // last known BTC regime (used if BTC data is temporarily missing)
  baselineEquity?: number;          // account equity when the strategy started (for % P&L)
  shadow?: ShadowState;             // same strategy without the AI cuts, marked to market
  history?: { t: number; live: number; shadow: number }[]; // % returns on capital, hourly
  review?: RiskOfficer["last"];
}

const SHADOW_COST = 0.003; // fee + slippage per side, as in the backtest

/**
 * Daily trend strategy runner. Each day after the UTC close: load completed daily bars, compute the
 * ensemble signals and target weights, apply the AI risk officer's cuts (reduce-only), and hand the
 * differences to the executor. Deterministic from price history, so restarts simply recompute.
 */
export class TrendTrader {
  params: TrendParams;
  interval: Interval;
  variant: string;
  signals: Record<string, CoinSignal | null> = {};
  raw: Record<string, number> = {};
  final: Record<string, number> = {};
  multipliers: Record<string, number> = {};
  regime: boolean | null = null; filtered: Record<string, string> = {};
  lastRun = 0; nextRun = 0; lastReviewAt = 0; lastError = ""; sources: Record<string, string> = {};
  private st: Persisted = {};
  private running = false;
  private rerun?: string;
  reflex?: NewsReflex;

  constructor(
    private cfg: Config, private agent: Agent, private exec: Executor, private bars: DailyBarsOpts,
    private officer: RiskOfficer | undefined, private notify: Notifier, private statePath = "logs/trend-state.json",
  ) {
    const v = VARIANTS[cfg.trend.variant];
    if (!v) throw new Error(`TREND_VARIANT must be one of ${Object.keys(VARIANTS).join(", ")}`);
    this.variant = cfg.trend.variant;
    this.interval = v.interval;
    this.params = { ...v.params, targetVol: cfg.trend.targetVol, maxWeight: cfg.trend.maxWeight };
    if (existsSync(statePath)) {
      try { this.st = JSON.parse(readFileSync(statePath, "utf8")); } catch { this.st = {}; }
    }
    if (officer && this.st.review) officer.last = this.st.review;
    this.lastReviewAt = this.st.review?.at ?? 0;
  }

  private save() {
    this.st.review = this.officer?.last;
    writeFileSync(this.statePath, JSON.stringify(this.st));
  }

  /** Capital the strategy sizes against: the configured amount, never more than the account holds. */
  capital() { return Math.min(this.cfg.capitalUsd, this.agent.equityNow()); }

  async run(reason: string) {
    // A news cut must not be lost because a scheduled run is in progress: queue it.
    if (this.running) { if (reason === "news") this.rerun = reason; return; }
    this.running = true;
    this.lastRun = Date.now();
    try {
      const syms = this.cfg.symbols;
      const loaded = await Promise.all(syms.map(async (s) => {
        try {
          const need = Math.max(this.params.minHistory, ...this.params.lookbacks, this.params.volWindow) + 50;
          const r = await candles(s, this.bars, this.interval, need);
          this.sources[s] = `${r.source} (${r.bars.length} ${this.interval} candles to ${r.bars.at(-1)?.date})`;
          return [s, r.bars] as const;
        }
        catch (e) { this.sources[s] = (e as Error).message; return [s, null] as const; }
      }));
      const failed = loaded.filter(([, b]) => !b).map(([s]) => s);
      if (failed.length === syms.length) throw new Error("no daily bars for any symbol: " + Object.values(this.sources)[0]);
      // A coin whose data failed keeps its current position rather than being sold on missing data.
      for (const [s, b] of loaded) this.signals[s] = b ? coinSignal(b.map((x) => x.close), this.params) : this.signals[s] ?? null;
      this.raw = targetWeights(this.signals, this.params);
      if (this.cfg.trend.filters) {
        const t = this.cfg.trend;
        const closes = Object.fromEntries(loaded.map(([s, b]) => [s, b?.map((x) => x.close)]));
        const regimeSym = syms.find((s) => s.startsWith("BTC")) ?? syms[0];
        const f = applyRegimeFilters(this.raw, this.signals, closes, regimeSym,
          { btcMaDays: t.filterBtcMaDays, coinMaDays: t.filterCoinMaDays, minSignal: t.filterMinSignal, barsPerDay: this.interval === "4h" ? 6 : 1 },
          this.st.lastRegime ?? null);
        this.raw = f.weights;
        this.regime = f.regimeUsed;
        this.filtered = f.reasons;
        if (f.regime !== null) this.st.lastRegime = f.regime;
      }

      // AI risk officer: at most every AI_REVIEW_EVERY_HOURS (free-tier friendly), reduce-only.
      const hrs = this.cfg.trend.aiReviewEveryHours;
      if (this.officer && Date.now() - this.lastReviewAt >= hrs * 3600_000 * 0.95) {
        this.lastReviewAt = Date.now();
        const r = await this.officer.review(this.view());
        if (r) {
          const cuts = Object.entries(r.cuts).filter(([, c]) => c.multiplier < 1).map(([s, c]) => `${s} x${c.multiplier}: ${c.reason}`);
          if (cuts.length) void this.notify.send(`AI risk officer cut: ${cuts.join(" | ")}`);
        }
      }
      const base = (s: string) => s.replace(/(USDT|USDC|USD)$/, "");
      for (const s of syms) this.multipliers[s] = (this.officer ? this.officer.multiplier(s, hrs * 2) : 1) * (this.reflex ? this.reflex.multiplier(base(s)) : 1);
      this.final = Object.fromEntries(syms.map((s) => [s, (this.raw[s] ?? 0) * this.multipliers[s]]));

      const cap = this.capital(), orders: string[] = [];
      // Sells first so buys have the cash.
      const plan = syms.filter((s) => !failed.includes(s) && this.agent.mid(s)).map((s) => {
        const cur = this.agent.positionUsd(s) / cap, tgt = this.final[s];
        return { s, cur, tgt, side: tgt < cur ? "sell" as const : "buy" as const };
      }).sort((a, b) => (a.side === b.side ? 0 : a.side === "sell" ? -1 : 1));
      for (const { s, cur, tgt, side } of plan) {
        if (!needsTrade(cur, tgt)) { this.exec.cancel(s); continue; }
        if (side === "buy" && this.agent.risk.halted) continue;
        // News: only act on the cuts (sells), immediately; buys wait for the next scheduled run.
        if (reason === "news" && side === "buy") continue;
        this.exec.submit(s, side, Math.abs(tgt - cur) * cap, reason, tgt === 0, reason === "news");
        orders.push(`${side} ${s} ${(cur * 100).toFixed(1)}%→${(tgt * 100).toFixed(1)}%`);
      }
      this.updateShadow(true);
      this.lastError = "";
      this.save();
      const lines = syms.map((s) => `${s} ${((this.signals[s]?.signal ?? 0) * 9).toFixed(0)}/9 → ${(this.final[s] * 100).toFixed(1)}%`);
      const regimeNote = this.cfg.trend.filters ? `[BTC regime ${this.regime === true ? "ON" : this.regime === false ? "OFF" : "unknown"}] ` : "";
      console.log(`trend ${reason}: ${regimeNote}${lines.join(", ")}${orders.length ? " | orders: " + orders.join(", ") : " | no trades"}`);
      if (orders.length) void this.notify.send(`Rebalance (${reason}): ${orders.join(", ")}`);
    } catch (e) {
      this.lastError = (e as Error).message.slice(0, 300);
      this.agent.event("error", "trend", `rebalance failed: ${this.lastError}`);
      void this.notify.send(`Rebalance failed: ${this.lastError}`);
    } finally {
      this.running = false;
      if (this.rerun) { const r = this.rerun; this.rerun = undefined; void this.run(r); }
    }
  }

  /** What the risk officer sees about the strategy. */
  private view() {
    return {
      description: `Donchian breakout ensemble (variant ${this.variant}: lookbacks ${this.params.lookbacks.join("/")} ${this.interval} candles), trailing mid-channel stops, portfolio vol target ${this.params.targetVol}`,
      coins: Object.fromEntries(this.cfg.symbols.map((s) => {
        const g = this.signals[s];
        return [s, g ? { modelsLong: g.models.filter(Boolean).length + "/" + g.models.length, annualVol: +g.vol.toFixed(2), targetWeight: +(this.raw[s] ?? 0).toFixed(3), currentWeight: +(this.agent.positionUsd(s) / this.capital()).toFixed(3) } : "not enough history"];
      })),
    };
  }

  /** Shadow portfolio: the same targets without AI cuts, rebalanced with the same thresholds and costs. */
  private updateShadow(rebalance: boolean) {
    const cap = this.cfg.capitalUsd;
    const sh = (this.st.shadow ??= { cash: cap, units: {} });
    const mark = (s: string) => this.agent.mid(s) ?? 0;
    const nav = () => sh.cash + Object.entries(sh.units).reduce((a, [s, u]) => a + u * mark(s), 0);
    if (rebalance) {
      const eq = nav();
      for (const s of this.cfg.symbols) {
        const px = mark(s); if (!px) continue;
        const cur = ((sh.units[s] ?? 0) * px) / eq, tgt = this.raw[s] ?? 0;
        if (!needsTrade(cur, tgt)) continue;
        const d = (tgt - cur) * eq;
        sh.units[s] = (sh.units[s] ?? 0) + d / px;
        sh.cash -= d + Math.abs(d) * SHADOW_COST;
      }
    }
    this.st.baselineEquity ??= this.agent.equityNow();
    const live = (this.agent.equityNow() - this.st.baselineEquity) / cap, shadow = nav() / cap - 1;
    const h = (this.st.history ??= []);
    if (!h.length || Date.now() - h.at(-1)!.t > 3600_000) { h.push({ t: Date.now(), live, shadow }); if (h.length > 24 * 400) h.shift(); }
    return { live, shadow };
  }

  /** Next run: 5 minutes after the next candle close (daily: at REBALANCE_UTC_HOUR; 4h: 00/04/08/12/16/20 UTC). */
  private scheduleNext() {
    let next: number;
    if (this.interval === "1d") {
      const n = new Date(); n.setUTCHours(this.cfg.trend.rebalanceUtcHour, 5, 0, 0);
      if (n.getTime() <= Date.now()) n.setUTCDate(n.getUTCDate() + 1);
      next = n.getTime();
    } else {
      const ms = INTERVAL_MS[this.interval];
      next = Math.floor(Date.now() / ms) * ms + ms + 5 * 60_000;
      if (next - ms > Date.now()) next -= ms; // still inside the 5-minute grace of the current close
    }
    this.nextRun = next;
    setTimeout(() => { void this.run(this.interval === "1d" ? "daily" : this.interval).then(() => this.scheduleNext()); }, this.nextRun - Date.now()).unref();
  }

  async start() {
    // Let the live feed deliver prices first (orders are sized off live mids).
    await new Promise((r) => setTimeout(r, 5000));
    await this.run("startup");
    this.scheduleNext();
    // Intraday: the risk officer may cut (reduce-only) between daily runs; the systematic signal stays the daily one.
    if (this.officer) setInterval(() => void this.run("ai-review"), this.cfg.trend.aiReviewEveryHours * 3600_000).unref();
    setInterval(() => { this.updateShadow(false); this.save(); }, 600_000).unref();
  }

  snapshot() {
    const perf = this.updateShadow(false);
    return {
      trend: {
        params: this.params, variant: this.variant, interval: this.interval,
        filters: this.cfg.trend.filters ? { regime: this.regime, btcMaDays: this.cfg.trend.filterBtcMaDays, coinMaDays: this.cfg.trend.filterCoinMaDays, minSignal: this.cfg.trend.filterMinSignal } : null,
        capital: this.capital(), lastRun: this.lastRun, nextRun: this.nextRun, lastError: this.lastError, sources: this.sources,
        coins: this.cfg.symbols.map((s) => {
          const g = this.signals[s], stops = g?.stops.filter((x): x is number => x != null) ?? [];
          return {
            symbol: s, models: g?.models ?? [], signal: g?.signal ?? null, vol: g?.vol ?? null,
            nearestStop: stops.length ? Math.max(...stops) : null,
            raw: this.raw[s] ?? 0, multiplier: this.multipliers[s] ?? 1, filteredBy: this.filtered[s] ?? "",
            reason: [this.officer?.last?.cuts[s]?.multiplier !== undefined && this.officer.last.cuts[s].multiplier < 1 ? `AI: ${this.officer.last.cuts[s].reason}` : "",
              this.reflex && this.reflex.multiplier(s.replace(/(USDT|USDC|USD)$/, "")) < 1 ? `News: ${this.reflex.activeCuts().filter((c) => c.coin === "market" || c.coin === s.replace(/(USDT|USDC|USD)$/, "")).map((c) => c.title).join(" | ")}` : ""].filter(Boolean).join(" · "),
            target: this.final[s] ?? 0, current: this.agent.positionUsd(s) / Math.max(1, this.capital()),
            job: (() => { const j = this.exec.jobs.get(s); return j ? { side: j.side, totalUsd: j.totalUsd, remainingUsd: j.remainingUsd, waits: j.waits } : null; })(),
          };
        }),
        officer: this.officer ? { ...this.officer.status, at: this.officer.last?.at ?? 0, model: this.officer.last?.model ?? this.cfg.strategist.model, note: this.officer.last?.note ?? "", everyH: this.cfg.trend.aiReviewEveryHours } : null,
        execution: { ...this.exec.stats, avgShortfallBps: this.exec.avgShortfallBps(), recent: this.exec.recent.slice(0, 8), windowMin: this.cfg.trend.execWindowMin },
        performance: { livePct: perf.live * 100, shadowPct: perf.shadow * 100, history: (this.st.history ?? []).slice(-24 * 90) },
      },
    };
  }
}

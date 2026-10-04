import type { Decision, Fill, MarketState, Model } from "./types.js";

/**
 * Works each rebalance order over a time window instead of hitting the market at once.
 * The order is split into `slices`; slice k is due at start + k*gap. When a slice is due, Jev is asked
 * about the next few minutes. If it is confidently against us (buy while it expects a dip, sell while
 * it expects a bounce) we wait and re-check; otherwise, or once the slice is 80% of a gap late, we
 * trade. Every order finishes by its deadline whatever Jev says.
 *
 * Jev's value is measured, not assumed: each completed order records its average fill against the mid
 * price when the order was created (implementation shortfall, in bps; lower is better).
 */
export interface ExecOpts { windowMin: number; slices: number; checkSec: number; waitConfidence: number; minOrderUsd: number }

export interface Job {
  symbol: string; side: "buy" | "sell"; totalUsd: number; remainingUsd: number; closeAll: boolean; reason: string;
  createdAt: number; gapMs: number; slices: number; sliceIdx: number; nextCheck: number; arrivalMid: number;
  filledQty: number; filledNotional: number; timedSlices: number; forcedSlices: number; waits: number; failures: number;
}

export interface ExecDeps {
  model: Model;
  state: (symbol: string) => MarketState | null;
  mid: (symbol: string) => number | undefined;
  positionUsd: (symbol: string) => number;
  place: (symbol: string, side: "buy" | "sell", usd: number, why: string, d?: Decision) => Promise<Fill | null>;
  onDecision?: (symbol: string, mid: number, d: Decision) => void;
  onEvent?: (kind: "fill" | "skip" | "error", symbol: string, text: string, side?: "buy" | "sell") => void;
}

export class Executor {
  jobs = new Map<string, Job>();
  private busy = new Set<string>();
  stats = { completed: 0, cancelled: 0, slices: 0, timedSlices: 0, forcedSlices: 0, waits: 0, notionalUsd: 0, shortfallUsd: 0 };
  recent: { symbol: string; side: string; usd: number; shortfallBps: number; at: number }[] = [];

  constructor(private o: ExecOpts, private d: ExecDeps, private now: () => number = Date.now) {}

  /**
   * Replaces any unfinished order for the symbol (the newest target wins).
   * `urgent`: one slice, sent on the next tick without waiting for Jev (news cuts, where speed is the point).
   */
  submit(symbol: string, side: "buy" | "sell", usd: number, reason: string, closeAll = false, urgent = false) {
    const mid = this.d.mid(symbol);
    if (!mid || usd < this.o.minOrderUsd) return;
    const t = this.now();
    const slices = urgent ? 1 : Math.max(1, Math.min(this.o.slices, Math.floor(usd / this.o.minOrderUsd)));
    this.jobs.set(symbol, {
      symbol, side, totalUsd: usd, remainingUsd: usd, closeAll, reason, createdAt: t,
      gapMs: urgent ? 0 : (this.o.windowMin * 60_000) / slices, slices, sliceIdx: 0, nextCheck: t, arrivalMid: mid,
      filledQty: 0, filledNotional: 0, timedSlices: 0, forcedSlices: 0, waits: 0, failures: 0,
    });
  }

  cancel(symbol: string) { if (this.jobs.delete(symbol)) this.stats.cancelled++; }


  async onTick(symbol: string) {
    const j = this.jobs.get(symbol);
    const t = this.now();
    if (!j || this.busy.has(symbol) || t < j.nextCheck) return;
    const due = j.createdAt + j.sliceIdx * j.gapMs;
    if (t < due) return;
    this.busy.add(symbol);
    try {
      const forced = t >= due + j.gapMs * 0.8;
      let decision: Decision | undefined;
      if (!forced) {
        const st = this.d.state(symbol);
        if (st) {
          decision = await this.d.model.decide(st);
          this.d.onDecision?.(symbol, st.mid, decision);
          const against = j.side === "buy" ? decision.probabilities.sell : decision.probabilities.buy;
          if (against >= this.o.waitConfidence) {
            j.waits++; this.stats.waits++;
            j.nextCheck = t + this.o.checkSec * 1000;
            return;
          }
        }
      }
      const left = Math.max(1, j.slices - j.sliceIdx);
      let usd = left <= 1 ? j.remainingUsd : j.remainingUsd / left;
      if (j.remainingUsd - usd < this.o.minOrderUsd) usd = j.remainingUsd;
      const finalSlice = usd >= j.remainingUsd - 1e-9;
      // Closing trades sell the whole live position on the last slice, so no dust is left behind.
      if (j.side === "sell" && j.closeAll && finalSlice) usd = Math.max(usd, this.d.positionUsd(symbol) * 1.01);
      const fill = await this.d.place(symbol, j.side, usd, `rebalance:${j.reason}${forced ? " (deadline)" : " (jev-timed)"}`, decision);
      if (!fill) {
        // Blocked (e.g. order-rate limit) or declined: retry. Give up only well past the window.
        j.failures++;
        if (t > j.createdAt + this.o.windowMin * 60_000 * 3) { this.jobs.delete(symbol); this.stats.cancelled++; this.d.onEvent?.("error", symbol, `order abandoned: ${j.failures} slices refused`); }
        else j.nextCheck = t + this.o.checkSec * 1000;
        return;
      }
      forced ? (j.forcedSlices++, this.stats.forcedSlices++) : (j.timedSlices++, this.stats.timedSlices++);
      this.stats.slices++;
      j.filledQty += fill.qty; j.filledNotional += fill.qty * fill.price;
      j.remainingUsd = finalSlice ? 0 : j.remainingUsd - usd;
      j.sliceIdx++;
      j.nextCheck = t;
      if (j.remainingUsd < 1) this.finish(j);
    } catch (e) {
      j.nextCheck = t + this.o.checkSec * 1000;
      this.d.onEvent?.("error", symbol, `execution: ${(e as Error).message}`);
    } finally {
      this.busy.delete(symbol);
    }
  }

  private finish(j: Job) {
    this.jobs.delete(j.symbol);
    if (!j.filledQty) return;
    const avg = j.filledNotional / j.filledQty;
    const bps = ((j.side === "buy" ? avg - j.arrivalMid : j.arrivalMid - avg) / j.arrivalMid) * 1e4;
    this.stats.completed++;
    this.stats.notionalUsd += j.filledNotional;
    this.stats.shortfallUsd += (bps / 1e4) * j.filledNotional;
    this.recent.unshift({ symbol: j.symbol, side: j.side, usd: j.filledNotional, shortfallBps: bps, at: this.now() });
    this.recent.length = Math.min(this.recent.length, 20);
    this.d.onEvent?.("fill", j.symbol, `${j.side} order done: $${j.filledNotional.toFixed(0)} in ${j.timedSlices + j.forcedSlices} slices (${j.timedSlices} Jev-timed, ${j.waits} waits), ${bps >= 0 ? "+" : ""}${bps.toFixed(1)} bps vs arrival`, j.side);
  }

  /** Average cost versus the arrival price across all finished orders, in bps (negative = Jev beat arrival). */
  avgShortfallBps() { return this.stats.notionalUsd ? (this.stats.shortfallUsd / this.stats.notionalUsd) * 1e4 : null; }
}

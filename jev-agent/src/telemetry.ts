import type { Decision } from "./types.js";

export interface EventRec { ts: number; kind: "fill" | "blocked" | "skip" | "error" | "kill"; symbol?: string; text: string; side?: "buy" | "sell" }
export interface DecisionRec { ts: number; symbol: string; d: Decision }

const ring = <T,>(a: T[], x: T, n: number) => { a.push(x); if (a.length > n) a.shift(); };

/** In-memory ring buffers that feed the dashboard. Nothing here is persisted; logs/decisions.jsonl is the durable record. */
export class Telemetry {
  readonly startedAt = Date.now();
  equity: [number, number][] = [];
  prices = new Map<string, [number, number][]>();
  events: EventRec[] = [];
  latencies: number[] = [];
  lastDecision = new Map<string, DecisionRec>();
  decisionMix = { buy: 0, sell: 0 };

  /**
   * Scorecard: every Jev call is checked against the real price once its horizon has passed.
   * Beyond hit rate it records the move in the predicted direction (bps), so we can see whether
   * Jev's edge, if any, is big enough to pay trading costs, broken down by Jev's confidence.
   */
  private pending: { symbol: string; mid: number; buy: boolean; conf: number; confident: boolean; due: number }[] = [];
  score = new Map<string, { n: number; hits: number; confN: number; confHits: number }>();
  buckets: Record<string, { n: number; hits: number; moveBps: number }> = { "50-60%": { n: 0, hits: 0, moveBps: 0 }, "60-70%": { n: 0, hits: 0, moveBps: 0 }, "70%+": { n: 0, hits: 0, moveBps: 0 } };
  trades = new Map<string, { wins: number; losses: number; realizedUsd: number }>();

  scoreOpen(symbol: string, mid: number, d: Decision, horizonSec: number, minConf: number) {
    this.pending.push({ symbol, mid, buy: d.probabilities.buy >= 0.5, conf: d.confidence, confident: d.confidence >= minConf, due: Date.now() + horizonSec * 1000 });
    if (this.pending.length > 50_000) this.pending.shift();
  }
  scoreMature(symbol: string, mid: number) {
    const now = Date.now();
    this.pending = this.pending.filter((p) => {
      if (p.symbol !== symbol || p.due > now) return true;
      if (mid !== p.mid) {
        const hit = p.buy === mid > p.mid;
        const s = this.score.get(symbol) ?? { n: 0, hits: 0, confN: 0, confHits: 0 };
        s.n++; s.hits += +hit;
        if (p.confident) { s.confN++; s.confHits += +hit; }
        this.score.set(symbol, s);
        const b = this.buckets[p.conf >= 0.7 ? "70%+" : p.conf >= 0.6 ? "60-70%" : "50-60%"];
        b.n++; b.hits += +hit; b.moveBps += ((mid - p.mid) / p.mid) * 1e4 * (p.buy ? 1 : -1);
      }
      return false;
    });
  }
  addTrade(symbol: string, realizedUsd: number) {
    const t = this.trades.get(symbol) ?? { wins: 0, losses: 0, realizedUsd: 0 };
    realizedUsd >= 0 ? t.wins++ : t.losses++;
    t.realizedUsd += realizedUsd;
    this.trades.set(symbol, t);
  }
  scoreTotals() {
    let n = 0, hits = 0, confN = 0, confHits = 0, wins = 0, losses = 0, realizedUsd = 0;
    for (const s of this.score.values()) { n += s.n; hits += s.hits; confN += s.confN; confHits += s.confHits; }
    for (const t of this.trades.values()) { wins += t.wins; losses += t.losses; realizedUsd += t.realizedUsd; }
    // z-score of the hit rate against a coin flip: |z| > 2 is unlikely to be luck (calls overlap in time, so treat it as optimistic).
    const z = n ? (hits - n / 2) / Math.sqrt(n / 4) : null;
    const buckets = Object.fromEntries(Object.entries(this.buckets).map(([k, b]) => [k, { n: b.n, hitRate: b.n ? b.hits / b.n : null, avgMoveBps: b.n ? b.moveBps / b.n : null }]));
    return { n, hitRate: n ? hits / n : null, z, confN, confHitRate: confN ? confHits / confN : null, buckets, wins, losses, realizedUsd };
  }

  addEquity(v: number) { ring(this.equity, [Date.now(), v], 3600); }
  addPrice(symbol: string, mid: number) {
    const a = this.prices.get(symbol) ?? []; this.prices.set(symbol, a);
    const last = a.at(-1);
    if (!last || Date.now() - last[0] >= 1000) ring(a, [Date.now(), mid], 300);
  }
  addDecision(symbol: string, d: Decision) {
    this.lastDecision.set(symbol, { ts: Date.now(), symbol, d });
    ring(this.latencies, d.latencyMs, 500);
    d.action === "buy" ? this.decisionMix.buy++ : this.decisionMix.sell++;
  }
  addEvent(e: Omit<EventRec, "ts">) {
    // A repeated block/skip (e.g. rate limit hit on every tick) would bury the fills, so show it once per 30 s.
    if (e.kind === "blocked" || e.kind === "skip" || e.kind === "error") {
      const dup = this.events.findLast((x) => x.kind === e.kind && x.symbol === e.symbol && x.text === e.text);
      if (dup && Date.now() - dup.ts < 30_000) return;
    }
    ring(this.events, { ts: Date.now(), ...e }, 200);
  }

  pct(p: number) {
    if (!this.latencies.length) return 0;
    const s = [...this.latencies].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
  }
}

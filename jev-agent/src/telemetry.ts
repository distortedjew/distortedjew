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
    if (e.kind === "blocked" || e.kind === "skip") {
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

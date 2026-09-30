import type { MarketData } from "./market-data.js";
import { askOpenRouter, extractJson } from "./openrouter.js";

export { extractJson };

/** The strategist's instructions for one symbol. The fast loop may only act inside these. */
export interface Plan {
  symbol: string;
  bias: "long" | "flat";
  conviction: number;      // 0..1
  size: number;            // 0..1 fraction of MAX_POSITION_USD to hold at most
  stopLossPct: number;     // exit if price falls this far below entry
  takeProfitPct: number;   // exit if price rises this far above entry
  maxHoldMin: number;      // exit after this long regardless
  reason: string;
  createdAt: number;
  expiresAt: number;
}

export interface StrategistOpts {
  apiKey: string;
  model: string;
  fallbackModels: string[];
  everyMin: number;
  feePctPerSide: number;
  timeoutMs: number;
}

const clamp = (x: unknown, lo: number, hi: number, d: number) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

const SYSTEM = (feePct: number) => `You are the strategist for an automated crypto trading agent (paper trading).
You set the plan; a fast execution model times entries within it, and hard-coded risk limits cap everything.

Rules of the venue:
- Spot, LONG-ONLY. "flat" means hold nothing. There is no shorting.
- Fees are about ${feePct}% per side, so a round trip costs ~${(feePct * 2).toFixed(2)}% plus spread. A trade is only worth taking when the expected move over the holding period clearly exceeds that.
- Default to "flat". Choose "long" only when several independent signals agree (trend across timeframes, momentum, order book, positioning, news). Being flat is a good outcome.

For every symbol return:
- bias: "long" or "flat"
- conviction: 0..1 (how strongly the evidence supports the bias)
- size: 0..1, the fraction of the per-symbol maximum to hold (use smaller sizes when volatility is high or evidence is mixed)
- stopLossPct: 0.3..5, set from volatility (about 1-2x the 1h ATR%)
- takeProfitPct: 0.5..10, at least 2x the round-trip cost and ideally >= 1.5x stopLossPct
- maxHoldMin: 5..720
- reason: one or two sentences citing the specific numbers that drove the call

Use the agent's own recent performance: if it is losing on a symbol, lower conviction or go flat.
Answer with ONLY a JSON object: {"plans":[{"symbol":"BTCUSDT","bias":"flat","conviction":0.2,"size":0,"stopLossPct":1.5,"takeProfitPct":3,"maxHoldMin":120,"reason":"..."}], "marketNote":"one sentence on the overall market"}`;

/** Validates and clamps one plan so a confused model can't produce a dangerous instruction. */
export function sanitizePlan(raw: any, symbol: string, now: number, validMin: number): Plan {
  const bias = raw?.bias === "long" ? "long" : "flat";
  const stop = clamp(raw?.stopLossPct, 0.3, 5, 1.5);
  return {
    symbol,
    bias,
    conviction: clamp(raw?.conviction, 0, 1, 0),
    size: bias === "long" ? clamp(raw?.size, 0, 1, 0) : 0,
    stopLossPct: stop,
    takeProfitPct: clamp(raw?.takeProfitPct, Math.max(0.5, stop), 10, stop * 2),
    maxHoldMin: clamp(raw?.maxHoldMin, 5, 720, 120),
    reason: String(raw?.reason ?? "").slice(0, 400),
    createdAt: now,
    expiresAt: now + validMin * 60_000,
  };
}

export class Strategist {
  plans = new Map<string, Plan>();
  status = { lastRun: 0, lastOk: 0, lastError: "", runs: 0, failures: 0, model: "", marketNote: "", latencyMs: 0 };
  private running = false;

  constructor(
    private o: StrategistOpts,
    private symbols: string[],
    private data: MarketData,
    /** Portfolio + performance context supplied by the agent at call time. */
    private context: () => unknown,
  ) {
    this.status.model = o.model;
  }

  /** A plan is usable until it expires (2 intervals), so one failed call doesn't flatten everything. */
  plan(symbol: string): Plan | undefined {
    const p = this.plans.get(symbol);
    return p && p.expiresAt > Date.now() ? p : undefined;
  }

  /** Latest plan even if expired: its stop-loss / take-profit still protect an open position. */
  lastPlan(symbol: string): Plan | undefined { return this.plans.get(symbol); }

  async run() {
    if (this.running) return;
    this.running = true;
    const t0 = Date.now();
    this.status.lastRun = t0;
    this.status.runs++;
    try {
      const markets = await Promise.all(this.symbols.map((s) => this.data.snapshot(s)));
      const user = JSON.stringify({ now: new Date().toISOString(), agent: this.context(), markets });
      const { text, model } = await askOpenRouter(this.o, [
        { role: "system", content: SYSTEM(this.o.feePctPerSide) },
        { role: "user", content: user },
      ]);
      const parsed = extractJson(text);
      const now = Date.now();
      const bySymbol = new Map<string, any>((parsed.plans ?? []).map((p: any) => [String(p.symbol).toUpperCase(), p]));
      // Symbols the model skipped are set flat rather than left on an old plan.
      for (const s of this.symbols) this.plans.set(s, sanitizePlan(bySymbol.get(s) ?? { bias: "flat", reason: "not covered by the strategist" }, s, now, this.o.everyMin * 2));
      Object.assign(this.status, { lastOk: now, lastError: "", model, marketNote: String(parsed.marketNote ?? "").slice(0, 300), latencyMs: now - t0 });
    } catch (e) {
      this.status.failures++;
      this.status.lastError = (e as Error).message.slice(0, 300);
      console.error("strategist:", this.status.lastError);
    } finally {
      this.running = false;
    }
  }

  start() {
    void this.run();
    setInterval(() => void this.run(), this.o.everyMin * 60_000).unref();
  }
}

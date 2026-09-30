import type { MarketData } from "./market-data.js";
import { askOpenRouter, extractJson, type OpenRouterOpts } from "./openrouter.js";

/**
 * AI risk officer. The systematic trend strategy has a documented edge; LLMs forecasting prices
 * does not. So the LLM gets one narrow power: cut a coin's target (multiplier 0..1) for a concrete,
 * identifiable risk. It can never add exposure, and anything it fails to answer, or answers badly,
 * leaves the systematic target untouched (multiplier 1).
 */
export interface Cut { multiplier: number; reason: string }
export interface Review { at: number; model: string; note: string; cuts: Record<string, Cut>; latencyMs: number }

const SYSTEM = `You are the risk officer for a systematic crypto trend-following strategy (spot, long-only, paper trading).
The strategy's positions come from a rules-based model with a long, published track record. You do NOT forecast prices and you do NOT add risk.

Your only power: for each coin, a multiplier from 0 to 1 applied to the strategy's target position.
- 1.0 = no change. This is the default and should be your answer almost always.
- Lower it ONLY for a concrete, identifiable risk that price trends cannot see yet, for example: an exchange or protocol hack or exploit,
  a delisting or regulatory action against that coin, a stablecoin or custody failure, extreme leverage (very high positive funding with
  rapidly rising open interest), or a major scheduled event in the next 24h with clearly asymmetric downside.
- Never lower it because the price fell, looks "overbought", or because of general market mood: the trend model already handles price.
- 0 means close the position. Use it only for a severe, specific threat.

Return ONLY JSON: {"note":"one sentence on overall risk conditions","coins":[{"symbol":"BTCUSDT","multiplier":1,"reason":"no specific risk"}]}`;

export function sanitizeCuts(raw: any, symbols: string[]): Record<string, Cut> {
  const by = new Map<string, any>((Array.isArray(raw?.coins) ? raw.coins : []).map((c: any) => [String(c?.symbol ?? "").toUpperCase(), c]));
  return Object.fromEntries(symbols.map((s) => {
    const c = by.get(s), m = Number(c?.multiplier);
    return [s, Number.isFinite(m) ? { multiplier: Math.min(1, Math.max(0, m)), reason: String(c?.reason ?? "").slice(0, 300) } : { multiplier: 1, reason: "no answer: unchanged" }];
  }));
}

export class RiskOfficer {
  last?: Review;
  status = { runs: 0, failures: 0, lastError: "" };
  constructor(private o: OpenRouterOpts, private symbols: string[], private data: MarketData) {}

  /** Multiplier for a coin; 1 when there is no fresh review (older than `maxAgeH`). */
  multiplier(symbol: string, maxAgeH: number) {
    if (!this.last || Date.now() - this.last.at > maxAgeH * 3600_000) return 1;
    return this.last.cuts[symbol]?.multiplier ?? 1;
  }

  async review(strategyView: unknown): Promise<Review | undefined> {
    const t0 = Date.now();
    this.status.runs++;
    try {
      const markets = await Promise.all(this.symbols.map((s) => this.data.snapshot(s)));
      const { text, model } = await askOpenRouter(this.o, [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify({ now: new Date().toISOString(), strategy: strategyView, markets }) },
      ]);
      const j = extractJson(text);
      this.last = { at: Date.now(), model, note: String(j.note ?? "").slice(0, 300), cuts: sanitizeCuts(j, this.symbols), latencyMs: Date.now() - t0 };
      this.status.lastError = "";
      return this.last;
    } catch (e) {
      this.status.failures++;
      this.status.lastError = (e as Error).message.slice(0, 300);
      console.error("risk officer:", this.status.lastError);
      return undefined;
    }
  }
}

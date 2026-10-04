import type { Decision, MarketState, Model } from "./types.js";

/**
 * Jev scorecard: asks Jev "higher or lower in HORIZON_SEC?" for each coin on a fixed cadence, without
 * trading, so its short-horizon accuracy is measured on live data at almost no cost. The results
 * (hit rate, z-score vs a coin flip, move in the predicted direction vs trading cost) decide whether
 * Jev deserves a bigger role, e.g. a limit-order scalper.
 */
export interface ScorecardDeps {
  model: Model;
  symbols: string[];
  state: (symbol: string) => MarketState | null;
  record: (symbol: string, mid: number, d: Decision) => void;
  onError?: (msg: string) => void;
}

export class Scorecard {
  calls = 0; errors = 0; lastError = "";
  private i = 0;
  private busy = false;
  private timer?: NodeJS.Timeout;
  constructor(private d: ScorecardDeps, private everySec: number) {}

  /** One call per tick, rotating through the coins, never more than one in flight. */
  async tick() {
    if (this.busy || !this.d.symbols.length) return;
    const symbol = this.d.symbols[this.i++ % this.d.symbols.length];
    const st = this.d.state(symbol);
    if (!st) return;
    this.busy = true;
    try {
      const dec = await this.d.model.decide(st);
      this.calls++;
      this.d.record(symbol, st.mid, dec);
    } catch (e) {
      this.errors++;
      this.lastError = (e as Error).message.slice(0, 200);
      if (this.errors % 20 === 1) this.d.onError?.(`scorecard: ${this.lastError}`);
    } finally {
      this.busy = false;
    }
  }

  start() {
    const ms = Math.max(1000, (this.everySec * 1000) / Math.max(1, this.d.symbols.length));
    this.timer = setInterval(() => void this.tick(), ms);
    this.timer.unref();
  }
  stop() { clearInterval(this.timer); }
}

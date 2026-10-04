/**
 * Active stock strategy: short-term mean reversion in large, liquid US stocks.
 *
 * Evidence: the short-term reversal effect (Jegadeesh 1990, Lehmann 1990) persists among large caps
 * net of costs, and Connors & Alvarez's RSI(2) rules (buy short-term oversold stocks that are in a
 * long-term uptrend, sell on the bounce) are its best-known practical form. Rules are fixed a priori
 * from that literature, not optimised on our data:
 *   regime   S&P 500 (SPY) close above its 200-day average (no new longs in bear markets)
 *   filter   stock close above its own 200-day average, price above $5
 *   entry    2-period RSI below 10 at the close; most oversold first; buy at the next open
 *   exit     close above the 5-day average, or after 10 trading days; sell at the next open
 *   sizing   up to 10 positions, 10% of capital each, long only, no leverage
 * Pure, incremental code shared by the backtest and the live trader.
 */

export interface RevParams {
  trendLen: number; rsiLen: number; entryRsi: number; exitLen: number; maxHoldDays: number;
  maxPositions: number; minPrice: number; useRegime: boolean;
}
export const DEFAULT_REV: RevParams = {
  trendLen: 200, rsiLen: 2, entryRsi: 10, exitLen: 5, maxHoldDays: 10, maxPositions: 10, minPrice: 5, useRegime: true,
};

/** Per-ticker indicator state, fed one daily close at a time. */
export class TickerState {
  closes: number[] = [];
  private avgGain = 0; private avgLoss = 0; private rsiN = 0;
  rsi: number | null = null;
  constructor(private p: RevParams = DEFAULT_REV) {}

  step(close: number) {
    const prev = this.closes.at(-1);
    this.closes.push(close);
    if (this.closes.length > Math.max(this.p.trendLen, 260) + 5) this.closes.shift();
    if (prev === undefined) return;
    const ch = close - prev, g = Math.max(0, ch), l = Math.max(0, -ch), n = this.p.rsiLen;
    // Wilder's RSI: simple average for the first n changes, then smoothed.
    if (this.rsiN < n) { this.avgGain += g / n; this.avgLoss += l / n; this.rsiN++; }
    else { this.avgGain = (this.avgGain * (n - 1) + g) / n; this.avgLoss = (this.avgLoss * (n - 1) + l) / n; }
    if (this.rsiN >= n) this.rsi = this.avgLoss === 0 ? 100 : 100 - 100 / (1 + this.avgGain / this.avgLoss);
  }
  sma(k: number) {
    if (this.closes.length < k) return null;
    let s = 0; for (let i = this.closes.length - k; i < this.closes.length; i++) s += this.closes[i];
    return s / k;
  }
  get close() { return this.closes.at(-1) ?? 0; }
  /** Return over [t-from, t-to] trading days, e.g. (252, 21) = 12-1 month momentum. */
  ret(from: number, to: number) {
    const n = this.closes.length;
    if (n <= from) return null;
    return this.closes[n - 1 - to] / this.closes[n - 1 - from] - 1;
  }
  /** Highest close over the last k days, excluding today. */
  high(k: number) {
    const n = this.closes.length;
    if (n <= k) return null;
    let h = -Infinity; for (let i = n - 1 - k; i < n - 1; i++) h = Math.max(h, this.closes[i]);
    return h;
  }
  /** Long-term uptrend and enough history. */
  uptrend() { const m = this.sma(this.p.trendLen); return m !== null && this.close > m; }
}

export interface Held { ticker: string; entryDate: string; daysHeld: number }

/** Exit check for a held position at today's close. */
export function shouldExit(s: TickerState, h: Held, p: RevParams = DEFAULT_REV): string | null {
  const m = s.sma(p.exitLen);
  if (m !== null && s.close > m) return "bounce";
  if (h.daysHeld >= p.maxHoldDays) return "time";
  return null;
}

/** New entries at today's close: oversold uptrend stocks, most oversold first, up to the free slots. */
export function pickEntries(states: Map<string, TickerState>, eligible: Iterable<string>, held: Set<string>, freeSlots: number, regimeOk: boolean, p: RevParams = DEFAULT_REV) {
  if (freeSlots <= 0 || (p.useRegime && !regimeOk)) return [];
  const c: { t: string; rsi: number }[] = [];
  for (const t of eligible) {
    if (held.has(t)) continue;
    const s = states.get(t);
    if (!s || s.rsi === null || s.close < p.minPrice || !s.uptrend()) continue;
    if (s.rsi < p.entryRsi) c.push({ t, rsi: s.rsi });
  }
  return c.sort((a, b) => a.rsi - b.rsi).slice(0, freeSlots).map((x) => x.t);
}

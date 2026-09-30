/**
 * Core strategy: long/flat crypto trend following with volatility-scaled sizing.
 *
 * Based on the published evidence for crypto trend following, notably
 * Zarattini, Pagani & Barbon (2025) "Catching Crypto Trends" (SSRN 5209907): an ensemble of
 * Donchian-channel breakout models over many lookbacks, a ratcheting mid-channel trailing stop,
 * and volatility-targeted position sizing. Parameters below are fixed a priori (not optimised on
 * our data) to avoid curve-fitting; the backtest exists to check them, not to tune them.
 *
 * Pure functions over daily closes: the backtester and the live agent call exactly the same code,
 * and the live agent recomputes everything from history each day, so a restart loses nothing.
 */

export interface Bar { date: string; open: number; high: number; low: number; close: number; volume: number }

export interface TrendParams {
  lookbacks: number[];      // Donchian lookbacks in days; the ensemble averages one long/flat model per lookback
  volWindow: number;        // days of returns for realised volatility
  targetVol: number;        // annualised volatility target for the whole portfolio when every model is long (0.25 = 25%)
  maxWeight: number;        // cap per coin as a fraction of equity
  maxGross: number;         // cap on total exposure (1 = no leverage)
  minHistory: number;       // days of data a coin needs before it can trade
}

export const DEFAULT_TREND: TrendParams = {
  lookbacks: [5, 10, 20, 30, 60, 90, 150, 250, 360],
  volWindow: 60,
  targetVol: 0.25,
  maxWeight: 0.35,
  maxGross: 1,
  minHistory: 365,
};

export interface CoinSignal {
  signal: number;           // 0..1: fraction of the ensemble models that are long
  models: boolean[];        // per-lookback long/flat
  stops: (number | null)[]; // per-lookback trailing stop (null when flat)
  vol: number;              // annualised realised volatility
  close: number;
  returns: number[];        // last `volWindow` daily log returns (for the correlation-aware sizing)
}

/**
 * Incremental ensemble: feed one daily close at a time. For each lookback n, entry is a close at or
 * above the highest close of the previous n days; exit is a close below a trailing stop that starts
 * at the channel midpoint and only ever rises. The backtester and the live agent both drive this.
 */
export class TrendEngine {
  private closes: number[] = [];
  private long: boolean[];
  private stop: number[];
  constructor(private p: TrendParams = DEFAULT_TREND) {
    this.long = p.lookbacks.map(() => false);
    this.stop = p.lookbacks.map(() => 0);
  }

  step(close: number) {
    const cs = this.closes;
    this.p.lookbacks.forEach((n, i) => {
      if (cs.length < n) return;
      let hi = -Infinity, lo = Infinity;
      for (let k = cs.length - n; k < cs.length; k++) { const c = cs[k]; if (c > hi) hi = c; if (c < lo) lo = c; }
      const mid = (hi + lo) / 2;
      if (!this.long[i]) {
        if (close >= hi) { this.long[i] = true; this.stop[i] = mid; }
      } else {
        this.stop[i] = Math.max(this.stop[i], mid);
        if (close < this.stop[i]) this.long[i] = false;
      }
    });
    cs.push(close);
    const keep = Math.max(...this.p.lookbacks, this.p.volWindow) + 1;
    if (cs.length > keep * 2) cs.splice(0, cs.length - keep);
    this.count++;
  }
  private count = 0;

  signal(): CoinSignal | null {
    if (this.count < this.p.minHistory) return null;
    const cs = this.closes, rets: number[] = [];
    for (let t = Math.max(1, cs.length - this.p.volWindow); t < cs.length; t++) rets.push(Math.log(cs[t] / cs[t - 1]));
    const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
    const vol = Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, rets.length - 1)) * Math.sqrt(365);
    return {
      signal: this.long.filter(Boolean).length / this.long.length,
      models: [...this.long],
      stops: this.long.map((l, i) => (l ? this.stop[i] : null)),
      vol,
      close: cs.at(-1)!,
      returns: rets,
    };
  }
}

/** Signal after replaying a full close history (what the live agent does once per day). */
export function coinSignal(closes: number[], p: TrendParams = DEFAULT_TREND): CoinSignal | null {
  const e = new TrendEngine(p);
  for (const c of closes) e.step(c);
  return e.signal();
}

/**
 * Target portfolio weights.
 *
 * 1. Risk parity base: each tradable coin gets 1/vol, so volatile coins get less money.
 * 2. That base portfolio is scaled so its volatility, from the recent covariance of the coins, equals
 *    `targetVol`. The scale depends on how correlated the coins are, not on current signals.
 * 3. Each coin's slice is then multiplied by its trend signal (0..1). All models long gives about
 *    targetVol; weak or absent trends mean proportionally less exposure and the rest stays in cash.
 * 4. Caps: `maxWeight` per coin, `maxGross` in total (no leverage).
 */
export function targetWeights(signals: Record<string, CoinSignal | null>, p: TrendParams = DEFAULT_TREND) {
  const live = Object.entries(signals).filter((e): e is [string, CoinSignal] => !!e[1] && e[1].vol > 0 && e[1].returns.length > 5);
  const w: Record<string, number> = Object.fromEntries(Object.keys(signals).map((s) => [s, 0]));
  if (!live.length) return w;
  const base = live.map(([, s]) => 1 / s.vol);
  const n = Math.min(...live.map(([, s]) => s.returns.length));
  const R = live.map(([, s]) => s.returns.slice(-n));
  const mu = R.map((r) => r.reduce((a, b) => a + b, 0) / n);
  let varP = 0;
  for (let i = 0; i < R.length; i++) for (let j = 0; j < R.length; j++) {
    let c = 0;
    for (let t = 0; t < n; t++) c += (R[i][t] - mu[i]) * (R[j][t] - mu[j]);
    varP += base[i] * base[j] * (c / (n - 1)) * 365;
  }
  const k = varP > 0 ? p.targetVol / Math.sqrt(varP) : 0;
  live.forEach(([s, sig], i) => { w[s] = Math.min(p.maxWeight, sig.signal * base[i] * k); });
  const gross = Object.values(w).reduce((a, b) => a + b, 0);
  if (gross > p.maxGross) for (const s in w) w[s] *= p.maxGross / gross;
  return w;
}

/**
 * Only trade when the change is worth the fee: small drifts from vol-scaling are ignored, but
 * exits (target 0) and fresh entries always go through.
 */
export function needsTrade(current: number, target: number, minAbs = 0.02, minRel = 0.2) {
  if (target === 0) return current > 1e-4;
  if (current < 1e-4) return target >= minAbs / 2;
  const d = Math.abs(target - current);
  return d >= minAbs && d >= minRel * Math.max(target, current);
}

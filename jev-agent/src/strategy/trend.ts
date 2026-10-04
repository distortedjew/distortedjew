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
  minHistory: number;       // bars of data a coin needs before it can trade
  barsPerYear: number;      // for annualising volatility (365 daily bars, 2190 four-hour bars)
}

export const DEFAULT_TREND: TrendParams = {
  lookbacks: [5, 10, 20, 30, 60, 90, 150, 250, 360],
  volWindow: 60,
  targetVol: 0.25,
  maxWeight: 0.35,
  maxGross: 1,
  minHistory: 365,
  barsPerYear: 365,
};

/**
 * Strategy variants by candle size. Lookbacks are in bars.
 *  1d       the published design: trends of 5-360 days, decided once a day.
 *  4h-fast  same bar counts on 4h candles: trends of ~1-60 days, reacts ~6x faster, trades more.
 *  4h-same  the 1d horizons (5-360 days) measured in 4h bars: same trends, checked every 4 hours.
 */
export type Interval = "1d" | "4h";
export const VARIANTS: Record<string, { interval: Interval; params: TrendParams }> = {
  "1d": { interval: "1d", params: DEFAULT_TREND },
  "4h-fast": { interval: "4h", params: { ...DEFAULT_TREND, volWindow: 360, minHistory: 400, barsPerYear: 2190 } },
  "4h-same": { interval: "4h", params: { ...DEFAULT_TREND, lookbacks: DEFAULT_TREND.lookbacks.map((n) => n * 6), volWindow: 360, minHistory: 2200, barsPerYear: 2190 } },
};
export const INTERVAL_MS: Record<Interval, number> = { "1d": 86_400_000, "4h": 14_400_000 };

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
    const vol = Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, rets.length - 1)) * Math.sqrt(this.p.barsPerYear);
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
    varP += base[i] * base[j] * (c / (n - 1)) * p.barsPerYear;
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

/**
 * Regime filters from the strategy tournament (src/arena/TOURNAMENT.md, winner r2-crypto-champplus),
 * which held up on the sealed 2024-26 holdout (Sharpe 0.71 vs 0.53 for the unfiltered strategy, max DD
 * -9.2% vs -15.8%):
 *  1. market regime: hold nothing while the regime asset (BTC) closes below its `btcMaDays` average
 *  2. consensus: hold a coin only when at least `minSignal` of the ensemble models are long (4 of 9)
 *  3. per-coin trend: hold a coin only while it closes above its own `coinMaDays` average
 * Averages are in days; `barsPerDay` converts for intraday candles.
 */
export interface RegimeFilterOpts { btcMaDays: number; coinMaDays: number; minSignal: number; barsPerDay: number }
export const DEFAULT_FILTERS: Omit<RegimeFilterOpts, "barsPerDay"> = { btcMaDays: 100, coinMaDays: 50, minSignal: 0.4 };

const aboveMa = (closes: number[] | undefined, n: number): boolean | null => {
  if (!closes || closes.length < n) return null;
  let s = 0; for (let i = closes.length - n; i < closes.length; i++) s += closes[i];
  return closes.at(-1)! >= s / n;
};

/** Returns filtered weights plus the regime state; `regime` is null when the regime asset has no usable data. */
export function applyRegimeFilters(weights: Record<string, number>, signals: Record<string, CoinSignal | null>,
  closes: Record<string, number[] | undefined>, regimeSymbol: string, o: RegimeFilterOpts, lastRegime: boolean | null = null) {
  const btcN = Math.round(o.btcMaDays * o.barsPerDay), coinN = Math.round(o.coinMaDays * o.barsPerDay);
  const live = aboveMa(closes[regimeSymbol], btcN);
  // Missing regime data: keep the last known regime rather than dumping everything on a data glitch.
  const regime = live ?? lastRegime;
  const out: Record<string, number> = {};
  const reasons: Record<string, string> = {};
  for (const [s, w] of Object.entries(weights)) {
    let why = "";
    if (regime !== true) why = regime === false ? "BTC below its average" : "no BTC regime data";
    else if ((signals[s]?.signal ?? 0) < o.minSignal) why = "fewer than 4 of 9 models long";
    else if (aboveMa(closes[s], coinN) !== true) why = "below its own average";
    out[s] = why ? 0 : w;
    if (why && w > 0) reasons[s] = why;
  }
  return { weights: out, regime: live, regimeUsed: regime, reasons };
}

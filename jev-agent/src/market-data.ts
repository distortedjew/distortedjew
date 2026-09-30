/**
 * The wider market picture for the strategist: multi-timeframe candles, order-book depth,
 * futures positioning and (optionally) news sentiment. All free public endpoints. Every source
 * is best-effort: a failed one becomes null and the strategist is told it's missing.
 */

type Kline = { o: number; h: number; l: number; c: number; v: number };

const get = async (url: string, timeoutMs = 8000) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`${new URL(url).host}${new URL(url).pathname}: ${r.status}`);
  return r.json();
};
const pct = (a: number, b: number) => (b ? +(((a - b) / b) * 100).toFixed(3) : 0);
const r2 = (x: number, d = 2) => +x.toFixed(d);

function ema(xs: number[], n: number) {
  const k = 2 / (n + 1);
  let e = xs[0];
  for (const x of xs.slice(1)) e = x * k + e * (1 - k);
  return e;
}
function rsi(closes: number[], n = 14) {
  if (closes.length <= n) return null;
  let up = 0, dn = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    d > 0 ? (up += d) : (dn -= d);
  }
  return dn === 0 ? 100 : r2(100 - 100 / (1 + up / dn), 1);
}
function atrPct(ks: Kline[], n = 14) {
  const tr = ks.slice(-n).map((k, i, a) => {
    const prev = i ? a[i - 1].c : k.o;
    return Math.max(k.h - k.l, Math.abs(k.h - prev), Math.abs(k.l - prev));
  });
  return r2((tr.reduce((s, x) => s + x, 0) / tr.length / ks.at(-1)!.c) * 100, 3);
}

/** Compact, model-friendly summary of one timeframe. */
export function summarize(ks: Kline[]) {
  const closes = ks.map((k) => k.c), last = closes.at(-1)!;
  const vols = ks.map((k) => k.v), avgVol = vols.slice(0, -1).reduce((s, x) => s + x, 0) / Math.max(1, vols.length - 1);
  const hi = Math.max(...ks.map((k) => k.h)), lo = Math.min(...ks.map((k) => k.l));
  return {
    changePct: pct(last, ks[0].o),
    lastBarPct: pct(last, ks.at(-1)!.o),
    vsEma20Pct: pct(last, ema(closes, 20)),
    vsEma50Pct: closes.length >= 50 ? pct(last, ema(closes, 50)) : null,
    rsi14: rsi(closes),
    atrPct: atrPct(ks),
    volumeVsAvg: avgVol ? r2(vols.at(-1)! / avgVol) : null,
    rangePosition: hi > lo ? r2((last - lo) / (hi - lo)) : 0.5, // 0 = at the low of the window, 1 = at the high
    last8Closes: closes.slice(-8).map((c) => +c.toPrecision(6)),
  };
}

export interface MarketDataOpts { restUrl: string; futuresUrl: string; alphaVantageKey: string; newsEveryMin: number }

export class MarketData {
  private newsCache = new Map<string, { ts: number; data: unknown }>();
  constructor(private o: MarketDataOpts) {}

  private async klines(symbol: string, interval: string, limit: number): Promise<Kline[]> {
    const rows = await get(`${this.o.restUrl}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    return rows.map((r: string[]) => ({ o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
  }

  private async depth(symbol: string) {
    const d = await get(`${this.o.restUrl}/api/v3/depth?symbol=${symbol}&limit=500`);
    const bids = d.bids.map(([p, q]: string[]) => [+p, +q]), asks = d.asks.map(([p, q]: string[]) => [+p, +q]);
    const mid = (bids[0][0] + asks[0][0]) / 2;
    const within = (side: number[][], pctBand: number) =>
      side.filter(([p]) => Math.abs(p - mid) / mid <= pctBand / 100).reduce((s, [p, q]) => s + p * q, 0);
    const band = (b: number) => {
      const bu = within(bids, b), au = within(asks, b);
      return { bidUsd: Math.round(bu), askUsd: Math.round(au), imbalance: bu + au ? r2((bu - au) / (bu + au)) : 0 };
    };
    return { spreadPct: r2(((asks[0][0] - bids[0][0]) / mid) * 100, 4), within0_5pct: band(0.5), within1pct: band(1) };
  }

  /** Perpetual-futures positioning. Not available from US IPs; returns null there. */
  private async futures(symbol: string) {
    const [prem, oi] = await Promise.all([
      get(`${this.o.futuresUrl}/fapi/v1/premiumIndex?symbol=${symbol}`),
      get(`${this.o.futuresUrl}/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=25`),
    ]);
    const first = +oi[0]?.sumOpenInterestValue, last = +oi.at(-1)?.sumOpenInterestValue;
    return {
      fundingRatePct: r2(+prem.lastFundingRate * 100, 4), // positive = longs pay shorts (crowded long)
      openInterestUsd: Math.round(last),
      openInterestChange24hPct: first ? pct(last, first) : null,
    };
  }

  /** Alpha Vantage news sentiment, cached (free tier is ~25 requests/day). */
  private async news(base: string) {
    if (!this.o.alphaVantageKey) return null;
    const hit = this.newsCache.get(base);
    if (hit && Date.now() - hit.ts < this.o.newsEveryMin * 60_000) return hit.data;
    const d = await get(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=CRYPTO:${base}&limit=20&apikey=${this.o.alphaVantageKey}`, 15000);
    if (!Array.isArray(d.feed)) throw new Error(`alphavantage: ${d.Information ?? d.Note ?? "no feed"}`);
    const items = d.feed.slice(0, 8).map((f: any) => {
      const t = (f.ticker_sentiment ?? []).find((x: any) => x.ticker === `CRYPTO:${base}`);
      return { time: f.time_published, title: f.title, sentiment: t ? +(+t.ticker_sentiment_score).toFixed(2) : +(+f.overall_sentiment_score).toFixed(2) };
    });
    const avg = items.length ? r2(items.reduce((s: number, x: any) => s + x.sentiment, 0) / items.length) : null;
    const data = { avgSentiment: avg, headlines: items }; // sentiment: -1 bearish .. +1 bullish
    this.newsCache.set(base, { ts: Date.now(), data });
    return data;
  }

  private async safe<T>(label: string, f: () => Promise<T>, errors: string[]): Promise<T | null> {
    try { return await f(); } catch (e) { errors.push(`${label}: ${(e as Error).message}`); return null; }
  }

  /** Everything the strategist sees about one Binance symbol (e.g. BTCUSDT). */
  async snapshot(symbol: string) {
    const errors: string[] = [];
    const base = symbol.replace(/(USDT|USDC|USD)$/, "");
    const [m1, m15, h1, d1, book, fut, news] = await Promise.all([
      this.safe("1m", () => this.klines(symbol, "1m", 60), errors),
      this.safe("15m", () => this.klines(symbol, "15m", 96), errors),
      this.safe("1h", () => this.klines(symbol, "1h", 72), errors),
      this.safe("1d", () => this.klines(symbol, "1d", 30), errors),
      this.safe("depth", () => this.depth(symbol), errors),
      this.safe("futures", () => this.futures(symbol), errors),
      this.safe("news", () => this.news(base), errors),
    ]);
    const s = (k: Kline[] | null) => (k && k.length > 2 ? summarize(k) : null);
    return {
      symbol, price: m1?.at(-1)?.c ?? h1?.at(-1)?.c ?? null,
      timeframes: { last60min_1m: s(m1), last24h_15m: s(m15), last3d_1h: s(h1), last30d_1d: s(d1) },
      orderBook: book, futures: fut, news,
      missing: errors,
    };
  }
}

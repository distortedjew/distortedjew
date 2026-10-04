import { INTERVAL_MS, type Bar, type Interval } from "./strategy/trend.js";

/**
 * Completed candles for the trend strategy. Binance first (deep history, no key); Alpaca's crypto
 * bars as a fallback (e.g. a US server where Binance.com is blocked). A candle that hasn't closed yet
 * is always dropped: signals are only computed on finished candles, exactly as in the backtest.
 * Keys: "YYYY-MM-DD" for 1d, "YYYY-MM-DDTHH:MM" (UTC) for 4h.
 */
export interface DailyBarsOpts { binanceRestUrl: string; alpacaKeyId?: string; alpacaSecret?: string; toAlpaca?: (s: string) => string | null }

const key = (t: number, iv: Interval) => new Date(t).toISOString().slice(0, iv === "4h" ? 16 : 10);

async function binance(symbol: string, restUrl: string, iv: Interval, count: number): Promise<Bar[]> {
  const out: Bar[] = [];
  let end = Date.now();
  // Page backwards, 1000 candles per request.
  while (out.length < count) {
    const r = await fetch(`${restUrl}/api/v3/klines?symbol=${symbol}&interval=${iv}&endTime=${end}&limit=1000`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`binance klines ${symbol}: ${r.status}`);
    const rows: any[][] = await r.json();
    if (!rows.length) break;
    out.unshift(...rows.map((k) => ({ t: k[0], date: key(k[0], iv), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] })));
    end = rows[0][0] - 1;
    if (rows.length < 1000) break;
  }
  return out as Bar[];
}

async function alpaca(symbol: string, o: DailyBarsOpts, iv: Interval, count: number): Promise<Bar[]> {
  const sym = o.toAlpaca?.(symbol);
  if (!sym) throw new Error(`no Alpaca symbol for ${symbol}`);
  const start = new Date(Date.now() - (count + 2) * INTERVAL_MS[iv]).toISOString();
  const out: Bar[] = [];
  let page: string | undefined;
  do {
    const u = new URL("https://data.alpaca.markets/v1beta3/crypto/us/bars");
    u.searchParams.set("symbols", sym); u.searchParams.set("timeframe", iv === "4h" ? "4Hour" : "1Day");
    u.searchParams.set("start", start); u.searchParams.set("limit", "10000");
    if (page) u.searchParams.set("page_token", page);
    const headers: Record<string, string> = o.alpacaKeyId ? { "APCA-API-KEY-ID": o.alpacaKeyId, "APCA-API-SECRET-KEY": o.alpacaSecret ?? "" } : {};
    const r = await fetch(u, { headers, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`alpaca bars ${sym}: ${r.status}`);
    const b = await r.json();
    for (const k of b.bars?.[sym] ?? []) { const t = Date.parse(k.t); out.push({ t, date: key(t, iv), open: k.o, high: k.h, low: k.l, close: k.c, volume: k.v } as Bar); }
    page = b.next_page_token ?? undefined;
  } while (page);
  return out;
}

export async function candles(symbol: string, o: DailyBarsOpts, iv: Interval = "1d", count = 800): Promise<{ bars: Bar[]; source: string }> {
  const errors: string[] = [];
  for (const [source, f] of [["binance", () => binance(symbol, o.binanceRestUrl, iv, count)], ["alpaca", () => alpaca(symbol, o, iv, count)]] as const) {
    try {
      const now = Date.now();
      const bars = (await f()).filter((b: any) => b.t + INTERVAL_MS[iv] <= now).sort((a: any, b: any) => a.t - b.t);
      if (bars.length) return { bars, source };
      errors.push(`${source}: no bars`);
    } catch (e) { errors.push((e as Error).message); }
  }
  throw new Error(`${iv} candles for ${symbol} unavailable: ${errors.join("; ")}`);
}

/** Back-compat: completed daily bars. */
export const dailyBars = (symbol: string, o: DailyBarsOpts, days = 800) => candles(symbol, o, "1d", days);

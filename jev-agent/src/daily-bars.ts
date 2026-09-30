import type { Bar } from "./strategy/trend.js";

/**
 * Completed daily bars for the trend strategy. Binance first (deep history, no key); Alpaca's crypto
 * bars as a fallback (e.g. a US server where Binance.com is blocked). The still-open current UTC day
 * is always dropped: signals are only ever computed on finished days, exactly as in the backtest.
 */
export interface DailyBarsOpts { binanceRestUrl: string; alpacaKeyId?: string; alpacaSecret?: string; toAlpaca?: (s: string) => string | null }

const today = () => new Date().toISOString().slice(0, 10);

async function binance(symbol: string, restUrl: string, days: number): Promise<Bar[]> {
  const r = await fetch(`${restUrl}/api/v3/klines?symbol=${symbol}&interval=1d&limit=${Math.min(1000, days + 1)}`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`binance klines ${symbol}: ${r.status}`);
  const rows: any[][] = await r.json();
  return rows.map((k) => ({ date: new Date(k[0]).toISOString().slice(0, 10), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
}

async function alpaca(symbol: string, o: DailyBarsOpts, days: number): Promise<Bar[]> {
  const sym = o.toAlpaca?.(symbol);
  if (!sym) throw new Error(`no Alpaca symbol for ${symbol}`);
  const start = new Date(Date.now() - (days + 2) * 864e5).toISOString();
  const out: Bar[] = [];
  let page: string | undefined;
  do {
    const u = new URL("https://data.alpaca.markets/v1beta3/crypto/us/bars");
    u.searchParams.set("symbols", sym); u.searchParams.set("timeframe", "1Day"); u.searchParams.set("start", start); u.searchParams.set("limit", "10000");
    if (page) u.searchParams.set("page_token", page);
    const headers: Record<string, string> = o.alpacaKeyId ? { "APCA-API-KEY-ID": o.alpacaKeyId, "APCA-API-SECRET-KEY": o.alpacaSecret ?? "" } : {};
    const r = await fetch(u, { headers, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`alpaca bars ${sym}: ${r.status}`);
    const b = await r.json();
    for (const k of b.bars?.[sym] ?? []) out.push({ date: String(k.t).slice(0, 10), open: k.o, high: k.h, low: k.l, close: k.c, volume: k.v });
    page = b.next_page_token ?? undefined;
  } while (page);
  return out;
}

export async function dailyBars(symbol: string, o: DailyBarsOpts, days = 800): Promise<{ bars: Bar[]; source: string }> {
  const errors: string[] = [];
  for (const [source, f] of [["binance", () => binance(symbol, o.binanceRestUrl, days)], ["alpaca", () => alpaca(symbol, o, days)]] as const) {
    try {
      const bars = (await f()).filter((b) => b.date < today()).sort((a, b) => a.date.localeCompare(b.date));
      if (bars.length) return { bars, source };
      errors.push(`${source}: no bars`);
    } catch (e) { errors.push((e as Error).message); }
  }
  throw new Error(`daily bars for ${symbol} unavailable: ${errors.join("; ")}`);
}

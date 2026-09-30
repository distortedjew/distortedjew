/**
 * Downloads full daily history from Binance's public API into data/<COIN>.csv for the backtest.
 *   npm run fetch-data                          # default coins
 *   npm run fetch-data -- BTCUSDT,ETHUSDT       # specific symbols
 * Set BINANCE_REST_URL=https://api.binance.us on a US server.
 */
import { mkdirSync, writeFileSync } from "node:fs";

const rest = process.env.BINANCE_REST_URL?.trim() || "https://api.binance.com";
const symbols = (process.argv[2] ?? process.env.SYMBOLS ?? "BTCUSDT,ETHUSDT,SOLUSDT,DOGEUSDT,AVAXUSDT,LINKUSDT").split(",").map((s) => s.trim().toUpperCase());
mkdirSync("data", { recursive: true });

for (const sym of symbols) {
  const rows: string[] = [];
  let start = Date.parse("2017-01-01T00:00:00Z");
  for (;;) {
    const r = await fetch(`${rest}/api/v3/klines?symbol=${sym}&interval=1d&startTime=${start}&limit=1000`);
    if (!r.ok) throw new Error(`${sym}: ${r.status} ${await r.text()}`);
    const k: any[][] = await r.json();
    if (!k.length) break;
    for (const x of k) rows.push([new Date(x[0]).toISOString().slice(0, 10), x[1], x[2], x[3], x[4], x[5]].join(","));
    start = k.at(-1)![0] + 86_400_000;
    if (k.length < 1000) break;
  }
  const today = new Date().toISOString().slice(0, 10);
  const done = rows.filter((r) => r.slice(0, 10) < today);
  const file = `data/${sym.replace(/(USDT|USDC|USD)$/, "")}.csv`;
  writeFileSync(file, "date,open,high,low,close,volume\n" + done.join("\n") + "\n");
  console.log(`${file}: ${done.length} days (${done[0]?.slice(0, 10)} .. ${done.at(-1)?.slice(0, 10)})`);
}

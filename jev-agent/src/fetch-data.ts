/**
 * Downloads full daily history from Binance's public API into data/<COIN>.csv for the backtest.
 *   npm run fetch-data                          # default coins
 *   npm run fetch-data -- --interval 4h         # 4-hour candles into data/<COIN>-4h.csv
 *   npm run fetch-data -- --symbols BTCUSDT,ETHUSDT
 * Set BINANCE_REST_URL=https://api.binance.us on a US server.
 */
import { mkdirSync, writeFileSync } from "node:fs";

const rest = process.env.BINANCE_REST_URL?.trim() || "https://api.binance.com";
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const symbols = (arg("symbols") ?? process.env.SYMBOLS ?? "BTCUSDT,ETHUSDT,SOLUSDT,DOGEUSDT,AVAXUSDT,LINKUSDT").split(",").map((s) => s.trim().toUpperCase());
const interval = arg("interval") ?? "1d";
if (!["1d", "4h"].includes(interval)) throw new Error("--interval must be 1d or 4h");
const ms = interval === "4h" ? 14_400_000 : 86_400_000;
// Keys: "YYYY-MM-DD" for daily, "YYYY-MM-DDTHH:MM" (UTC) for 4h.
const key = (t: number) => new Date(t).toISOString().slice(0, interval === "4h" ? 16 : 10);
mkdirSync("data", { recursive: true });

for (const sym of symbols) {
  const rows: string[] = [];
  let start = Date.parse("2017-01-01T00:00:00Z");
  for (;;) {
    const r = await fetch(`${rest}/api/v3/klines?symbol=${sym}&interval=${interval}&startTime=${start}&limit=1000`);
    if (!r.ok) throw new Error(`${sym}: ${r.status} ${await r.text()}`);
    const k: any[][] = await r.json();
    if (!k.length) break;
    for (const x of k) if (x[0] + ms <= Date.now()) rows.push([key(x[0]), x[1], x[2], x[3], x[4], x[5]].join(",")); // completed candles only
    start = k.at(-1)![0] + ms;
    if (k.length < 1000) break;
  }
  const done = rows;
  const file = `data/${sym.replace(/(USDT|USDC|USD)$/, "")}${interval === "4h" ? "-4h" : ""}.csv`;
  writeFileSync(file, "date,open,high,low,close,volume\n" + done.join("\n") + "\n");
  console.log(`${file}: ${done.length} ${interval} candles (${done[0]?.split(",")[0]} .. ${done.at(-1)?.split(",")[0]})`);
}

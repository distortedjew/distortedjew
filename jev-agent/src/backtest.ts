/**
 * Daily backtest of the trend strategy on data/*.csv (date,open,high,low,close,volume).
 * Signals use the close of day t; trades execute at the open of day t+1 (no look-ahead).
 * Every trade pays FEE + SLIPPAGE on its notional. Compared against buy-and-hold benchmarks.
 *
 *   npm run backtest                    # default universe and costs
 *   npm run backtest -- --fee 0.5       # stress costs (% per side, fee + slippage)
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { DEFAULT_TREND, TrendEngine, needsTrade, targetWeights, type Bar, type TrendParams } from "./strategy/trend.js";

export function loadBars(path: string): Bar[] {
  return readFileSync(path, "utf8").trim().split("\n").slice(1).map((l) => {
    const [date, o, h, lo, c, v] = l.split(",");
    return { date, open: +o, high: +h, low: +lo, close: +c, volume: +v };
  });
}

export interface Result { name: string; equity: { date: string; value: number }[]; turnover: number; trades: number; exposure: number[] }

type Universe = Record<string, Map<string, Bar>>;
const dates = (u: Universe, start: string) => [...new Set(Object.values(u).flatMap((m) => [...m.keys()]))].filter((d) => d >= start).sort();

/** Generic daily portfolio simulator: `targets(day)` returns desired weights at that day's close. */
function simulate(name: string, u: Universe, start: string, costPct: number,
  targets: (date: string) => Record<string, number>, trade: (cur: number, tgt: number) => boolean = needsTrade): Result {
  const ds = dates(u, start);
  let cash = 1, trades = 0, turnover = 0;
  const units: Record<string, number> = {};
  const equity: Result["equity"] = [], exposure: number[] = [];
  let pending: Record<string, number> | null = null;
  const px = (s: string, d: string, f: "open" | "close") => u[s].get(d)?.[f];
  for (const d of ds) {
    // 1) execute yesterday's decision at today's open
    if (pending) {
      let eq = cash;
      for (const s in units) eq += units[s] * (px(s, d, "open") ?? 0);
      for (const [s, w] of Object.entries(pending)) {
        const p = px(s, d, "open"); if (!p) continue;
        const curW = ((units[s] ?? 0) * p) / eq;
        if (!trade(curW, w)) continue;
        const dUsd = (w - curW) * eq, cost = Math.abs(dUsd) * costPct / 100;
        units[s] = (units[s] ?? 0) + dUsd / p;
        cash -= dUsd + cost;
        trades++; turnover += Math.abs(dUsd) / eq;
      }
    }
    // 2) mark to market at the close, then decide for tomorrow
    let eq = cash, long = 0;
    for (const s in units) { const v = units[s] * (px(s, d, "close") ?? u[s].get(d)?.close ?? lastClose(u[s], d)); eq += v; long += v; }
    equity.push({ date: d, value: eq });
    exposure.push(eq > 0 ? long / eq : 0);
    pending = targets(d);
  }
  return { name, equity, turnover, trades, exposure };
}
const lastClose = (m: Map<string, Bar>, d: string) => { let v = 0; for (const [k, b] of m) { if (k > d) break; v = b.close; } return v; };

export function trendStrategy(u: Universe, start: string, costPct: number, p: TrendParams = DEFAULT_TREND, name = "Trend ensemble") {
  const engines = Object.fromEntries(Object.keys(u).map((s) => [s, new TrendEngine(p)]));
  // warm up engines on history before `start`
  const all = [...new Set(Object.values(u).flatMap((m) => [...m.keys()]))].sort();
  for (const d of all) if (d < start) for (const s in u) { const b = u[s].get(d); if (b) engines[s].step(b.close); }
  return simulate(name, u, start, costPct, (d) => {
    const sig: Record<string, ReturnType<TrendEngine["signal"]>> = {};
    for (const s in u) { const b = u[s].get(d); if (b) engines[s].step(b.close); sig[s] = b ? engines[s].signal() : null; }
    return targetWeights(sig, p);
  });
}

export function buyHold(u: Universe, start: string, costPct: number, symbols: string[], name: string) {
  let month = "";
  return simulate(name, u, start, costPct, (d) => {
    const live = symbols.filter((s) => u[s].has(d) && [...u[s].keys()][0] <= addDays(d, -365));
    const w = Object.fromEntries(symbols.map((s) => [s, live.includes(s) ? 1 / live.length : 0]));
    if (d.slice(0, 7) === month) return {}; // rebalance monthly
    month = d.slice(0, 7);
    return w;
  }, (c, t) => Math.abs(c - t) > 0.01);
}

/** Grayscale-style 20/100-day moving-average crossover, equal weight across coins, no vol scaling. */
export function maCross(u: Universe, start: string, costPct: number) {
  const hist: Record<string, number[]> = Object.fromEntries(Object.keys(u).map((s) => [s, []]));
  const n = Object.keys(u).length;
  const all = [...new Set(Object.values(u).flatMap((m) => [...m.keys()]))].sort();
  for (const d of all) if (d < start) for (const s in u) { const b = u[s].get(d); if (b) hist[s].push(b.close); }
  const sma = (a: number[], k: number) => a.slice(-k).reduce((x, y) => x + y, 0) / k;
  return simulate("MA 20/100 cross", u, start, costPct, (d) => {
    const w: Record<string, number> = {};
    for (const s in u) {
      const b = u[s].get(d); if (b) hist[s].push(b.close);
      const h = hist[s];
      w[s] = h.length >= 365 && sma(h, 20) > sma(h, 100) ? 1 / n : 0;
    }
    return w;
  }, (c, t) => (t === 0 ? c > 1e-4 : Math.abs(c - t) > 0.05 * t));
}

const addDays = (d: string, k: number) => new Date(Date.parse(d) + k * 864e5).toISOString().slice(0, 10);

export function metrics(r: Result) {
  const v = r.equity.map((e) => e.value);
  const years = (Date.parse(r.equity.at(-1)!.date) - Date.parse(r.equity[0].date)) / (365.25 * 864e5);
  const rets = v.slice(1).map((x, i) => x / v[i] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
  const down = Math.sqrt(rets.reduce((a, b) => a + Math.min(0, b) ** 2, 0) / rets.length);
  let peak = -Infinity, mdd = 0;
  for (const x of v) { peak = Math.max(peak, x); mdd = Math.min(mdd, x / peak - 1); }
  const cagr = (v.at(-1)! / v[0]) ** (1 / years) - 1;
  return {
    cagr, vol: sd * Math.sqrt(365), sharpe: sd ? (mean / sd) * Math.sqrt(365) : 0, sortino: down ? (mean / down) * Math.sqrt(365) : 0,
    maxDD: mdd, calmar: mdd ? cagr / -mdd : 0, total: v.at(-1)! / v[0] - 1,
    turnoverPerYear: r.turnover / years, tradesPerYear: r.trades / years,
    avgExposure: r.exposure.reduce((a, b) => a + b, 0) / r.exposure.length,
  };
}

export function yearly(r: Result) {
  const out: Record<string, number> = {};
  let prev = r.equity[0].value, y = r.equity[0].date.slice(0, 4);
  for (let i = 1; i < r.equity.length; i++) {
    const yy = r.equity[i].date.slice(0, 4);
    if (yy !== y) { out[y] = r.equity[i - 1].value / prev - 1; prev = r.equity[i - 1].value; y = yy; }
  }
  out[y + " YTD"] = r.equity.at(-1)!.value / prev - 1;
  return out;
}

/** Restrict a result to a date window (rebased), for out-of-sample style checks. */
export function slice(r: Result, from: string, to = "9999"): Result {
  const i = r.equity.findIndex((e) => e.date >= from), j = r.equity.findLastIndex((e) => e.date <= to);
  return { ...r, equity: r.equity.slice(i, j + 1), exposure: r.exposure.slice(i, j + 1), turnover: 0, trades: 0 };
}

// ---------------------------------------------------------------- CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const symbols = arg("symbols", "BTC,ETH,SOL,DOGE,AVAX,LINK").split(",");
  const start = arg("start", "2018-01-01"), cost = +arg("fee", "0.30");
  const u: Universe = {};
  for (const s of symbols) {
    const f = `data/${s}.csv`;
    if (!existsSync(f)) { console.error(`missing ${f}`); continue; }
    u[s] = new Map(loadBars(f).map((b) => [b.date, b]));
  }
  const pct = (x: number) => (x * 100).toFixed(1).padStart(7) + "%";
  const row = (name: string, m: ReturnType<typeof metrics>) =>
    console.log(`${name.padEnd(28)}${pct(m.cagr)}${m.sharpe.toFixed(2).padStart(8)}${m.sortino.toFixed(2).padStart(8)}${pct(m.maxDD)}${m.calmar.toFixed(2).padStart(8)}${pct(m.vol)}${pct(m.avgExposure)}${(m.tradesPerYear ? m.tradesPerYear.toFixed(0) : "-").padStart(8)}`);
  const header = () => console.log(`${"".padEnd(28)}${"CAGR".padStart(8)}${"Sharpe".padStart(8)}${"Sortino".padStart(8)}${"MaxDD".padStart(8)}${"Calmar".padStart(8)}${"Vol".padStart(8)}${"AvgExp".padStart(8)}${"Trd/yr".padStart(8)}`);

  const results = [
    trendStrategy(u, start, cost),
    maCross(u, start, cost),
    buyHold(u, start, cost, ["BTC"], "Buy & hold BTC"),
    buyHold(u, start, cost, symbols, "Buy & hold basket (monthly)"),
  ];
  console.log(`\nBacktest ${start} .. ${results[0].equity.at(-1)!.date}, ${symbols.join(" ")}, cost ${cost}% per side\n`);
  header(); for (const r of results) row(r.name, metrics(r));

  for (const [from, to, label] of [["2018-01-01", "2021-12-31", "2018-2021"], ["2022-01-01", "9999", "2022-now (incl. 2022 crash)"], [addDays(results[0].equity.at(-1)!.date, -365), "9999", "last 12 months"]]) {
    console.log(`\n${label}`); header();
    for (const r of results) row(r.name, metrics(slice(r, from, to)));
  }
  console.log("\nCalendar-year returns");
  const ys = results.map(yearly);
  console.log("".padEnd(10) + results.map((r) => r.name.slice(0, 14).padStart(16)).join(""));
  for (const y of Object.keys(ys[0])) console.log(y.padEnd(10) + ys.map((x) => pct(x[y] ?? NaN).padStart(16)).join(""));

  console.log("\nRobustness: trend ensemble under other costs and parameters (not used to pick parameters)");
  header();
  for (const c of [0.15, 0.5, 1.0]) row(`cost ${c}%`, metrics(trendStrategy(u, start, c)));
  for (const tv of [0.15, 0.35]) row(`targetVol ${tv}`, metrics(trendStrategy(u, start, cost, { ...DEFAULT_TREND, targetVol: tv })));
  for (const vw of [30, 90]) row(`volWindow ${vw}`, metrics(trendStrategy(u, start, cost, { ...DEFAULT_TREND, volWindow: vw })));
  row("short lookbacks only (5-30)", metrics(trendStrategy(u, start, cost, { ...DEFAULT_TREND, lookbacks: [5, 10, 20, 30] })));
  row("long lookbacks only (60-360)", metrics(trendStrategy(u, start, cost, { ...DEFAULT_TREND, lookbacks: [60, 90, 150, 250, 360] })));
  row("BTC+ETH only", metrics(trendStrategy(Object.fromEntries(Object.entries(u).filter(([k]) => ["BTC", "ETH"].includes(k))), start, cost)));

  writeFileSync("data/backtest-equity.csv", "date," + results.map((r) => r.name).join(",") + "\n" +
    results[0].equity.map((e, i) => [e.date, ...results.map((r) => r.equity[i]?.value.toFixed(4))].join(",")).join("\n") + "\n");
}

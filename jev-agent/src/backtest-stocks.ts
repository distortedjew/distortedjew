/**
 * Backtest of the active stock strategy (src/strategy/reversion.ts) on point-in-time S&P 500 members.
 * Input: a date-sorted CSV  date,ticker,open,high,low,close,volume,member  (split+dividend adjusted;
 * member=1 if the ticker was in the index that day; SPY included for the regime filter).
 * Signals at the close of day t, fills at the open of t+1, every fill pays COST% per side.
 * A held ticker with no prices for 5 days (delisted) is sold at its last close.
 *
 *   npm run backtest-stocks -- --file data/stocks.csv [--start 2008-01-01] [--cost 0.05]
 */
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { DEFAULT_REV, TickerState, pickEntries, shouldExit, type Held, type RevParams } from "./strategy/reversion.js";
import { metrics, slice, yearly, type Result } from "./backtest.js";

interface Bar { o: number; c: number; member: boolean }
interface Pos extends Held { shares: number; entryPx: number; cost: number; missing: number }

export interface StockRun extends Result { roundTrips: { pnlPct: number; days: number; why: string }[] }

export async function runReversion(file: string, start: string, costPct: number, p: RevParams = DEFAULT_REV, name = "Reversion"): Promise<{ strat: StockRun; spy: Result }> {
  const states = new Map<string, TickerState>();
  const lastClose = new Map<string, number>();
  const pos = new Map<string, Pos>();
  let cash = 1, pendingExit = new Map<string, string>(), pendingEntry: string[] = [];
  const equity: Result["equity"] = [], exposure: number[] = [], spyEq: Result["equity"] = [];
  const trips: StockRun["roundTrips"] = [];
  let trades = 0, turnover = 0, spyUnits = 0;
  const cost = costPct / 100;

  const sell = (t: string, px: number, why: string, eqRef: number) => {
    const ps = pos.get(t)!; const v = ps.shares * px;
    cash += v * (1 - cost); trades++; turnover += v / eqRef;
    trips.push({ pnlPct: ((px * (1 - cost)) / (ps.entryPx * (1 + cost)) - 1) * 100, days: ps.daysHeld, why });
    pos.delete(t);
  };

  const day = (date: string, bars: Map<string, Bar>) => {
    const trading = date >= start;
    const px = (t: string, f: "o" | "c") => bars.get(t)?.[f] ?? lastClose.get(t) ?? 0;
    if (trading) {
      // 1) yesterday's decisions fill at today's open: exits first, then entries
      let eqOpen = cash; for (const [t, ps] of pos) eqOpen += ps.shares * px(t, "o");
      for (const [t, why] of pendingExit) if (pos.has(t)) sell(t, px(t, "o"), why, eqOpen);
      const alloc = eqOpen / p.maxPositions;
      for (const t of pendingEntry) {
        const b = bars.get(t); if (!b || pos.has(t)) continue;
        const usd = Math.min(alloc, cash / (1 + cost)); if (usd < eqOpen * 0.01) continue;
        pos.set(t, { ticker: t, entryDate: date, daysHeld: 0, shares: usd / b.o, entryPx: b.o, cost: usd * cost, missing: 0 });
        cash -= usd * (1 + cost); trades++; turnover += usd / eqOpen;
      }
      if (!spyUnits && bars.get("SPY")) spyUnits = 1 / bars.get("SPY")!.o;
    }
    pendingExit = new Map(); pendingEntry = [];
    // 2) update indicators with today's closes
    for (const [t, b] of bars) {
      let s = states.get(t); if (!s) states.set(t, (s = new TickerState(p)));
      s.step(b.c); lastClose.set(t, b.c);
    }
    if (!trading) return;
    // 3) decide at the close
    for (const [t, ps] of pos) {
      if (!bars.has(t)) { if (++ps.missing >= 5) sell(t, lastClose.get(t) ?? ps.entryPx, "delisted", cash + 1e-9); continue; }
      ps.missing = 0; ps.daysHeld++;
      const why = shouldExit(states.get(t)!, ps, p);
      if (why) pendingExit.set(t, why);
    }
    const spy = states.get("SPY");
    const regimeOk = !!spy && spy.uptrend();
    const eligible = [...bars].filter(([t, b]) => b.member && t !== "SPY").map(([t]) => t);
    pendingEntry = pickEntries(states, eligible, new Set(pos.keys()), p.maxPositions - (pos.size - pendingExit.size), regimeOk, p);
    let eq = cash, inv = 0; for (const [t, ps] of pos) { const v = ps.shares * px(t, "c"); eq += v; inv += v; }
    equity.push({ date, value: eq }); exposure.push(eq > 0 ? inv / eq : 0);
    spyEq.push({ date, value: spyUnits * (bars.get("SPY")?.c ?? lastClose.get("SPY") ?? 0) });
  };

  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let cur = "", bars = new Map<string, Bar>(), header = true;
  for await (const line of rl) {
    if (header) { header = false; continue; }
    const [d, t, o, , , c, , m] = line.split(",");
    if (d !== cur) { if (cur) day(cur, bars); cur = d; bars = new Map(); }
    bars.set(t, { o: +o, c: +c, member: m === "1" });
  }
  if (cur) day(cur, bars);
  return { strat: { name, equity, turnover, trades, exposure, roundTrips: trips }, spy: { name: "Buy & hold SPY", equity: spyEq, turnover: 0, trades: 0, exposure: spyEq.map(() => 1) } };
}

// ---------------------------------------------------------------- CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const file = arg("file", "data/stocks.csv"), start = arg("start", "2008-01-01"), cost = +arg("cost", "0.05");
  if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1); }
  const pct = (x: number) => (x * 100).toFixed(1).padStart(7) + "%";
  const header = () => console.log(`${"".padEnd(30)}${"CAGR".padStart(8)}${"Sharpe".padStart(8)}${"MaxDD".padStart(8)}${"Vol".padStart(8)}${"AvgExp".padStart(8)}${"Trd/yr".padStart(8)}`);
  const row = (n: string, r: Result) => { const m = metrics(r); console.log(`${n.padEnd(30)}${pct(m.cagr)}${m.sharpe.toFixed(2).padStart(8)}${pct(m.maxDD)}${pct(m.vol)}${pct(m.avgExposure)}${(m.tradesPerYear ? m.tradesPerYear.toFixed(0) : "-").padStart(8)}`); };
  const tripStats = (r: StockRun) => {
    const t = r.roundTrips, w = t.filter((x) => x.pnlPct > 0);
    const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
    return `${t.length} round trips · win rate ${(100 * w.length / Math.max(1, t.length)).toFixed(1)}% · avg trade ${avg(t.map((x) => x.pnlPct)).toFixed(2)}% · avg win ${avg(w.map((x) => x.pnlPct)).toFixed(2)}% · avg loss ${avg(t.filter((x) => x.pnlPct <= 0).map((x) => x.pnlPct)).toFixed(2)}% · avg hold ${avg(t.map((x) => x.days)).toFixed(1)} days`;
  };

  const { strat, spy } = await runReversion(file, start, cost);
  console.log(`\nActive stock strategy (RSI(2) mean reversion), point-in-time S&P 500, ${start} .. ${strat.equity.at(-1)!.date}, cost ${cost}% per side\n`);
  header(); row("Reversion (10 slots)", strat); row("Buy & hold SPY", spy);
  console.log("\n" + tripStats(strat));
  for (const [f, t, l] of [["2008-01-01", "2014-12-31", "2008-2014 (FLATTERED: missing delisted names)"], ["2015-01-01", "9999", "2015-now (main test, 76-97% coverage)"], ["2022-01-01", "9999", "2022-now"], ["2025-10-01", "9999", "last 12 months"]]) {
    if (f < start) continue;
    console.log(`\n${l}`); header(); row("Reversion", slice(strat, f, t)); row("Buy & hold SPY", slice(spy, f, t));
  }
  console.log("\nCalendar years        Reversion    SPY");
  const ys = yearly(strat), yb = yearly(spy);
  for (const y of Object.keys(ys)) console.log(`${y.padEnd(18)}${pct(ys[y]).padStart(11)}${pct(yb[y] ?? NaN).padStart(9)}`);

  console.log("\nRobustness (not used to choose parameters)"); header();
  for (const c of [0.1, 0.2]) row(`cost ${c}%`, (await runReversion(file, start, c)).strat);
  const v = async (n: string, q: Partial<RevParams>) => row(n, (await runReversion(file, start, cost, { ...DEFAULT_REV, ...q })).strat);
  await v("entry RSI < 5", { entryRsi: 5 });
  await v("entry RSI < 20", { entryRsi: 20 });
  await v("5 slots", { maxPositions: 5 });
  await v("20 slots", { maxPositions: 20 });
  await v("no SPY regime filter", { useRegime: false });
  await v("max hold 5 days", { maxHoldDays: 5 });
}

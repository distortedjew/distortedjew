/**
 * Alternative active stock strategies, same data, same next-open fills and costs as backtest-stocks.ts.
 *  momentum  weekly: hold the top N members by 12-1 month return (uptrend + SPY regime), with a 2N buffer
 *  breakout  daily: buy members closing at a 52-week high (SPY regime), exit on a 10% trailing stop from the
 *            highest close since entry or a close below the 50-day average; up to N slots, strongest 12-1 first
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { DEFAULT_REV, TickerState } from "./strategy/reversion.js";
import { metrics, slice, yearly, type Result } from "./backtest.js";

type Bars = Map<string, { o: number; c: number; member: boolean }>;
export async function stream(file: string, onDay: (date: string, bars: Bars) => void) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let cur = "", bars: Bars = new Map(), header = true;
  for await (const line of rl) {
    if (header) { header = false; continue; }
    const [d, t, o, , , c, , m] = line.split(",");
    if (d !== cur) { if (cur) onDay(cur, bars); cur = d; bars = new Map(); }
    bars.set(t, { o: +o, c: +c, member: m === "1" });
  }
  if (cur) onDay(cur, bars);
}

export async function runAlt(kind: "momentum" | "breakout", file: string, start: string, costPct: number, N = 20, name = kind): Promise<Result & { trips: number[] }> {
  const P = { ...DEFAULT_REV, maxPositions: N };
  const states = new Map<string, TickerState>(), last = new Map<string, number>();
  const pos = new Map<string, { shares: number; entry: number; peak: number; missing: number }>();
  let cash = 1, trades = 0, turnover = 0, dayN = 0;
  let pendExit = new Set<string>(), pendEntry: string[] = [];
  const eq: Result["equity"] = [], ex: number[] = [], trips: number[] = [];
  const cost = costPct / 100;
  await stream(file, (date, bars) => {
    const trading = date >= start;
    const px = (t: string, f: "o" | "c") => bars.get(t)?.[f] ?? last.get(t) ?? 0;
    if (trading) {
      let eqO = cash; for (const [t, p] of pos) eqO += p.shares * px(t, "o");
      for (const t of pendExit) { const p = pos.get(t); if (!p) continue; const v = p.shares * px(t, "o"); cash += v * (1 - cost); trades++; turnover += v / eqO; trips.push(((px(t, "o") * (1 - cost)) / (p.entry * (1 + cost)) - 1) * 100); pos.delete(t); }
      const alloc = eqO / N;
      for (const t of pendEntry) { const b = bars.get(t); if (!b || pos.has(t)) continue; const usd = Math.min(alloc, cash / (1 + cost)); if (usd < eqO * 0.005) continue; pos.set(t, { shares: usd / b.o, entry: b.o, peak: b.o, missing: 0 }); cash -= usd * (1 + cost); trades++; turnover += usd / eqO; }
    }
    pendExit = new Set(); pendEntry = [];
    for (const [t, b] of bars) { let s = states.get(t); if (!s) states.set(t, (s = new TickerState(P))); s.step(b.c); last.set(t, b.c); }
    if (!trading) return;
    dayN++;
    for (const [t, p] of pos) {
      if (!bars.has(t)) { if (++p.missing >= 5) pendExit.add(t); continue; }
      p.missing = 0; p.peak = Math.max(p.peak, bars.get(t)!.c);
    }
    const spy = states.get("SPY"), regime = !!spy && spy.uptrend();
    const members = [...bars].filter(([t, b]) => b.member && t !== "SPY").map(([t]) => t);
    const mom = (t: string) => states.get(t)?.ret(252, 21) ?? null;
    if (kind === "momentum") {
      if (dayN % 5 === 1) { // weekly
        const ranked = members.filter((t) => { const s = states.get(t)!; return mom(t) !== null && s.uptrend() && s.close >= 5; })
          .sort((a, b) => mom(b)! - mom(a)!);
        const top = new Set(ranked.slice(0, N)), buffer = new Set(ranked.slice(0, 2 * N));
        for (const t of pos.keys()) if (!regime || !buffer.has(t)) pendExit.add(t);
        if (regime) pendEntry = [...top].filter((t) => !pos.has(t)).slice(0, N - (pos.size - pendExit.size));
      }
    } else {
      for (const [t, p] of pos) { const s = states.get(t); if (!s || !bars.has(t)) continue; const m50 = s.sma(50); if (s.close < p.peak * 0.9 || (m50 !== null && s.close < m50)) pendExit.add(t); }
      const free = N - (pos.size - pendExit.size);
      if (regime && free > 0) pendEntry = members.filter((t) => { const s = states.get(t)!, h = s.high(252); return !pos.has(t) && h !== null && s.close > h && s.close >= 5 && mom(t) !== null; })
        .sort((a, b) => mom(b)! - mom(a)!).slice(0, free);
    }
    let e = cash, inv = 0; for (const [t, p] of pos) { const v = p.shares * px(t, "c"); e += v; inv += v; }
    eq.push({ date, value: e }); ex.push(e > 0 ? inv / e : 0);
  });
  return { name, equity: eq, turnover, trades, exposure: ex, trips };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = "data/stocks.csv", start = "2008-01-01";
  const pct = (x: number) => (x * 100).toFixed(1).padStart(7) + "%";
  const header = () => console.log(`${"".padEnd(30)}${"CAGR".padStart(8)}${"Sharpe".padStart(8)}${"MaxDD".padStart(8)}${"Vol".padStart(8)}${"AvgExp".padStart(8)}${"Trd/yr".padStart(8)}`);
  const row = (n: string, r: Result) => { const m = metrics(r); console.log(`${n.padEnd(30)}${pct(m.cagr)}${m.sharpe.toFixed(2).padStart(8)}${pct(m.maxDD)}${pct(m.vol)}${pct(m.avgExposure)}${(m.tradesPerYear ? m.tradesPerYear.toFixed(0) : "-").padStart(8)}`); };
  const runs: Record<string, Result & { trips: number[] }> = {};
  for (const k of ["momentum", "breakout"] as const) for (const c of [0.05, 0.2]) runs[`${k} @${c}%`] = await runAlt(k, file, start, c);
  for (const [f, t, l] of [["2008-01-01", "9999", "2008-now"], ["2015-01-01", "9999", "2015-now (main test)"], ["2022-01-01", "9999", "2022-now"], ["2025-10-01", "9999", "last 12 months"]]) {
    console.log(`\n${l}`); header();
    for (const [n, r] of Object.entries(runs)) row(n, slice(r, f, t));
  }
  for (const [n, r] of Object.entries(runs)) if (n.endsWith("0.05%")) {
    const w = r.trips.filter((x) => x > 0).length;
    console.log(`${n}: ${r.trips.length} round trips, win rate ${(100 * w / r.trips.length).toFixed(1)}%, avg ${(r.trips.reduce((a, b) => a + b, 0) / r.trips.length).toFixed(2)}%`);
  }
  console.log("\nCalendar years   momentum  breakout");
  const ym = yearly(runs["momentum @0.05%"]), yb = yearly(runs["breakout @0.05%"]);
  for (const y of Object.keys(ym)) console.log(`${y.padEnd(15)}${pct(ym[y]).padStart(10)}${pct(yb[y] ?? NaN).padStart(10)}`);
}

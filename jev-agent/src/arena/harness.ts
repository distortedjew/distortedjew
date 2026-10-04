/**
 * STRATEGY ARENA HARNESS: locked. Strategies must not modify this file.
 *
 * A strategy is a module whose default export implements `Strategy`. Each trading day, after the
 * close, `onBar(ctx)` returns target portfolio weights (fractions of equity) or null for "no change".
 * Weights fill at the NEXT day's open. Every trade pays COST% of its notional per side.
 * Rules enforced here: long-only (w >= 0), no leverage (sum <= 1, scaled down if above), symbols
 * without a bar that day can't trade. `ctx` only exposes bars up to and including today (no look-ahead).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { metrics } from "../backtest.js";

export interface Bar { date: string; open: number; high: number; low: number; close: number; volume: number }

export interface Ctx {
  date: string;                       // today (YYYY-MM-DD); you are at the close
  symbols: string[];                  // all symbols in the arena (some may not have started trading yet)
  has(sym: string): boolean;          // does `sym` have a bar today?
  bars(sym: string, n: number): Bar[];      // last n bars up to and including today, oldest first (fewer if less history)
  closes(sym: string, n: number): number[]; // same, closes only
  weights(): Record<string, number>;  // current portfolio weights at today's close
  equity(): number;                   // current equity (starts at 1)
  barsPerYear: number;                // 365 for crypto, 252 for ETFs
}

export interface Strategy {
  name: string;
  description: string;
  onBar(ctx: Ctx): Record<string, number> | null;
}

export const ARENAS = {
  crypto: { dir: "arena-data/crypto", cost: 0.30, barsPerYear: 365, train: ["2018-01-01", "2021-12-31"], validation: ["2022-01-01", "2024-06-30"], holdout: ["2024-07-01", "2099-12-31"] },
  etf: { dir: "arena-data/etf", cost: 0.05, barsPerYear: 252, train: ["2008-01-01", "2018-12-31"], validation: ["2019-01-01", "2023-12-31"], holdout: ["2024-01-01", "2099-12-31"] },
} as const;
export type ArenaName = keyof typeof ARENAS;
export type Split = "train" | "validation" | "holdout" | "all";

function load(dir: string) {
  const data: Record<string, Bar[]> = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".csv"))) {
    data[f.replace(/\.csv$/, "")] = readFileSync(join(dir, f), "utf8").trim().split("\n").slice(1).map((l) => {
      const [date, o, h, lo, c, v] = l.split(",");
      return { date, open: +o, high: +h, low: +lo, close: +c, volume: +v };
    }).filter((b) => b.close > 0);
  }
  return data;
}

export function run(strategy: Strategy, arena: ArenaName, split: Split, dirOverride?: string) {
  const A = ARENAS[arena];
  const dir = dirOverride ?? A.dir;
  if (!existsSync(dir)) throw new Error(`missing ${dir}`);
  const data = load(dir);
  const [from, to] = split === "all" ? [A.train[0], A.holdout[1]] : A[split];
  const syms = Object.keys(data).sort();
  const dates = [...new Set(Object.values(data).flatMap((b) => b.map((x) => x.date)))].filter((d) => d <= to).sort();
  if (!dates.some((d) => d >= from)) throw new Error(`no data in ${split} (${from}..${to}) for ${arena}`);
  const idx: Record<string, Map<string, number>> = Object.fromEntries(syms.map((s) => [s, new Map(data[s].map((b, i) => [b.date, i]))]));
  const ptr: Record<string, number> = Object.fromEntries(syms.map((s) => [s, -1])); // index of latest bar <= today
  const cost = A.cost / 100;
  let cash = 1, trades = 0, turnover = 0;
  const units: Record<string, number> = {};
  let pending: Record<string, number> | null = null;
  const equity: { date: string; value: number }[] = [], exposure: number[] = [];
  const lastPx = (s: string) => (ptr[s] >= 0 ? data[s][ptr[s]].close : 0);
  const eqNow = () => cash + syms.reduce((a, s) => a + (units[s] ?? 0) * lastPx(s), 0);

  for (const d of dates) {
    for (const s of syms) { const i = idx[s].get(d); if (i !== undefined) ptr[s] = i; }
    const today = (s: string) => idx[s].has(d);
    const inWindow = d >= from;
    // 1) fill yesterday's targets at today's open
    if (pending && inWindow) {
      let eq = cash; for (const s of syms) eq += (units[s] ?? 0) * (today(s) ? data[s][ptr[s]].open : lastPx(s));
      const order = Object.keys(pending).sort((a, b) => (pending![a] - ((units[a] ?? 0) * lastPx(a)) / eq) - (pending![b] - ((units[b] ?? 0) * lastPx(b)) / eq)); // sells first
      for (const s of order) {
        if (!today(s)) continue;
        const px = data[s][ptr[s]].open, cur = ((units[s] ?? 0) * px) / eq, tgt = pending[s];
        if (Math.abs(tgt - cur) < 1e-4) continue;
        let dUsd = (tgt - cur) * eq;
        if (dUsd > 0) dUsd = Math.min(dUsd, cash / (1 + cost));
        units[s] = (units[s] ?? 0) + dUsd / px;
        cash -= dUsd + Math.abs(dUsd) * cost;
        trades++; turnover += Math.abs(dUsd) / eq;
      }
    }
    pending = null;
    // 2) at the close: mark, then ask the strategy
    const eq = eqNow();
    if (inWindow) {
      equity.push({ date: d, value: eq });
      exposure.push(eq > 0 ? (eq - cash) / eq : 0);
    }
    const ctx: Ctx = {
      date: d, symbols: syms, barsPerYear: A.barsPerYear,
      has: (s) => !!idx[s] && today(s),
      bars: (s, n) => (ptr[s] >= 0 ? data[s].slice(Math.max(0, ptr[s] - n + 1), ptr[s] + 1) : []),
      closes: (s, n) => (ptr[s] >= 0 ? data[s].slice(Math.max(0, ptr[s] - n + 1), ptr[s] + 1).map((b) => b.close) : []),
      weights: () => Object.fromEntries(syms.map((s) => [s, eq > 0 ? ((units[s] ?? 0) * lastPx(s)) / eq : 0])),
      equity: () => eq,
    };
    const w = strategy.onBar(ctx);
    if (w && inWindow) {
      const clean: Record<string, number> = {};
      for (const s of syms) { const x = Number(w[s] ?? 0); clean[s] = Number.isFinite(x) && x > 0 ? x : 0; }
      const sum = Object.values(clean).reduce((a, b) => a + b, 0);
      if (sum > 1) for (const s in clean) clean[s] /= sum;
      pending = clean;
    }
  }
  const r = { name: strategy.name, equity, turnover, trades, exposure };
  const m = metrics(r);
  return { strategy: strategy.name, arena, split, from: equity[0]?.date, to: equity.at(-1)?.date, ...m, score: m.sharpe, equity };
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildState, normalizeReason, parseLog } from "../src/stats.ts";

const T = (s: number) => new Date(1_700_000_000_000 + s * 1000).toISOString();
const ev = (s: number, event: string, d: object = {}) => JSON.stringify({ t: T(s), event, ...d });

const log = [
  ev(0, "skip", { mint: "a", symbol: "A", reason: "top10 holders 41%" }),
  ev(1, "skip", { mint: "b", symbol: "B", reason: "top10 holders 55%" }),
  ev(2, "entry", { mint: "c", symbol: "C", price: 1, sizeUsd: 25 }),
  ev(3, "status", { equityUsd: 500, startingBalanceUsd: 500, open: 1, realizedPnlUsd: 0, scanned: 3 }),
  ev(4, "exit", { mint: "c", symbol: "C", entryTime: 1, exitTime: 4, pnlUsd: 20, reason: "take-profit 2x" }),
  ev(5, "exit", { mint: "c", symbol: "C", entryTime: 1, exitTime: 5, pnlUsd: -5, reason: "trailing-stop" }),
  ev(6, "status", { equityUsd: 515, startingBalanceUsd: 500, open: 0, realizedPnlUsd: 15, scanned: 4 }),
  ev(7, "exit", { mint: "d", symbol: "D", entryTime: 2, exitTime: 7, pnlUsd: -10, reason: "stop-loss" }),
  ev(8, "status", { equityUsd: 505, startingBalanceUsd: 500, open: 0, realizedPnlUsd: 5, scanned: 5 }),
  "{ broken json",
].join("\n");

test("parseLog skips malformed lines", () => {
  assert.equal(parseLog(log).length, 9);
});

test("normalizeReason groups numeric variants", () => {
  assert.equal(normalizeReason("top10 holders 41%"), normalizeReason("top10 holders 55.5%"));
});

test("buildState groups fills per position and computes KPIs", () => {
  const now = Date.parse(T(10));
  const s = buildState(parseLog(log), now);
  assert.equal(s.kpis.closedPositions, 2);
  assert.equal(s.kpis.winRatePct, 50);
  assert.equal(s.kpis.profitFactor, 1.5); // 15 won / 10 lost
  assert.equal(s.kpis.maxDrawdownUsd, 10);
  assert.equal(s.skipReasons[0].n, 2);
  assert.equal(s.health.live, true);
  assert.equal(buildState(parseLog(log), now + 3_600_000).health.live, false);
});

test("empty log yields a safe zero state", () => {
  const s = buildState([], Date.now());
  assert.equal(s.kpis.winRatePct, null);
  assert.equal(s.health.live, false);
});

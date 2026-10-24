import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultConfig as cfg } from "../src/config.ts";
import { evaluateEntry } from "../src/filters.ts";
import { PaperPortfolio } from "../src/paper.ts";
import type { PairSnapshot, SecurityReport } from "../src/types.ts";

const pair: PairSnapshot = {
  mint: "M", symbol: "TST", pairAddress: "P", priceUsd: 1, liquidityUsd: 50_000,
  volume5mUsd: 20_000, buys5m: 100, sells5m: 40, priceChange5m: 10, ageSec: 120,
};
const safe: SecurityReport = {
  mintAuthorityRevoked: true, freezeAuthorityRevoked: true, top10HolderPct: 20,
  lpLockedPct: 100, dangerFlags: [],
};

test("accepts a clean pair", () => {
  assert.deepEqual(evaluateEntry(pair, safe, cfg), { ok: true });
});

test("rejects active mint authority, thin liquidity and flags", () => {
  assert.equal(evaluateEntry(pair, { ...safe, mintAuthorityRevoked: false }, cfg).ok, false);
  assert.equal(evaluateEntry({ ...pair, liquidityUsd: 100 }, safe, cfg).ok, false);
  assert.equal(evaluateEntry(pair, { ...safe, dangerFlags: ["Copycat token"] }, cfg).ok, false);
});

test("stop-loss closes position with a loss including slippage and fees", () => {
  const p = new PaperPortfolio(cfg);
  p.open("M", "TST", 1, 0);
  const trades = p.onPrice("M", 0.7, 1000);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].reason, "stop-loss");
  assert.ok(trades[0].pnlUsd < -cfg.positionSizeUsd * 0.25);
  assert.equal(p.positions.size, 0);
});

test("take-profit ladder sells in parts, then trailing stop exits the rest", () => {
  const p = new PaperPortfolio(cfg);
  p.open("M", "TST", 1, 0);
  const entry = p.positions.get("M")!.entryPrice;
  const t1 = p.onPrice("M", entry * 2, 1000);
  assert.equal(t1[0].reason, "take-profit 2x");
  assert.ok(p.positions.has("M"));
  p.onPrice("M", entry * 3, 2000); // raise peak, no rung hit
  const t2 = p.onPrice("M", entry * 3 * 0.75, 3000);
  assert.equal(t2.at(-1)!.reason, "trailing-stop");
  assert.equal(p.positions.size, 0);
});

test("max-hold timeout and daily loss limit", () => {
  const p = new PaperPortfolio({ ...cfg, dailyLossLimitUsd: 5 });
  p.open("A", "A", 1, 0);
  const t = p.onPrice("A", 1, cfg.maxHoldSec * 1000);
  assert.equal(t[0].reason, "max-hold timeout");
  p.open("B", "B", 1, 0);
  p.onPrice("B", 0.5, 10); // stop-loss, pushes realized below -5
  assert.equal(p.canOpen("C", 20), false);
});

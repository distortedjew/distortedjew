import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PaperBroker } from "../src/broker.js";
import { Executor } from "../src/executor.js";
import { sanitizeCuts } from "../src/overlay.js";
import { DEFAULT_TREND, TrendEngine, coinSignal, needsTrade, targetWeights, type CoinSignal } from "../src/strategy/trend.js";

const P = { ...DEFAULT_TREND, lookbacks: [5], minHistory: 6, volWindow: 5 };

test("breakout enters, ratcheting mid-channel stop exits", () => {
  const e = new TrendEngine(P);
  for (const c of [10, 10, 10, 10, 10]) e.step(c);
  e.step(11); // close >= highest of previous 5 -> long, stop = (10+10)/2 = 10
  assert.equal(e.signal()!.signal, 1);
  assert.equal(e.signal()!.stops[0], 10);
  for (const c of [12, 13, 14]) e.step(c); // stop ratchets up with the channel mid
  const stop = e.signal()!.stops[0]!;
  assert.ok(stop > 10);
  e.step(15);          // new high: still long (the stop ratchets with the channel before each close is checked)
  assert.equal(e.signal()!.signal, 1);
  e.step(e.signal()!.stops[0]! - 3); // close well below the stop: flat
  assert.equal(e.signal()!.signal, 0);
});

test("the stop never moves down", () => {
  const e = new TrendEngine(P);
  for (const c of [10, 10, 10, 10, 10, 11, 14, 14]) e.step(c);
  const s1 = e.signal()!.stops[0]!;
  e.step(13.9); // channel mid falls back a bit, stop must not
  assert.ok(e.signal()!.stops[0]! >= s1);
});

test("replay and incremental agree", () => {
  const closes = Array.from({ length: 800 }, (_, i) => 100 * Math.exp(Math.sin(i / 40) * 0.5 + i / 2000));
  const e = new TrendEngine(); for (const c of closes) e.step(c);
  assert.deepEqual(coinSignal(closes)!.models, e.signal()!.models);
});

const sig = (signal: number, vol: number, rets: number[]): CoinSignal => ({ signal, vol, returns: rets, models: [], stops: [], close: 1 });
const noise = (seed: number, amp = 0.03) => Array.from({ length: 60 }, (_, i) => Math.sin(i * 1.7 + seed) * amp);

test("weights: flat coins get nothing, volatile coins get less, caps hold", () => {
  const w = targetWeights({ A: sig(1, 0.5, noise(1)), B: sig(1, 1.0, noise(2)), C: sig(0, 0.5, noise(3)), D: null });
  assert.equal(w.C, 0); assert.equal(w.D, 0);
  assert.ok(w.A > w.B);
  assert.ok(Object.values(w).every((x) => x <= DEFAULT_TREND.maxWeight + 1e-9));
  assert.ok(Object.values(w).reduce((a, b) => a + b, 0) <= 1 + 1e-9);
});

test("weights scale with signal strength", () => {
  // high vol keeps weights under the per-coin cap, so the scaling is visible
  const full = targetWeights({ A: sig(1, 3, noise(1, 0.2)), B: sig(1, 3, noise(5, 0.2)) });
  const half = targetWeights({ A: sig(0.5, 3, noise(1, 0.2)), B: sig(1, 3, noise(5, 0.2)) });
  assert.ok(full.A < DEFAULT_TREND.maxWeight);
  assert.ok(Math.abs(half.A - full.A / 2) < 1e-9);
});

test("needsTrade ignores small drift but never misses exits or entries", () => {
  assert.equal(needsTrade(0.20, 0.21), false);
  assert.equal(needsTrade(0.20, 0.30), true);
  assert.equal(needsTrade(0.05, 0), true);
  assert.equal(needsTrade(0, 0.05), true);
});

test("risk officer answers are reduce-only and default to no change", () => {
  const c = sanitizeCuts({ coins: [{ symbol: "BTCUSDT", multiplier: 3 }, { symbol: "ETHUSDT", multiplier: -1, reason: "hack" }, { symbol: "SOLUSDT", multiplier: "x" }] }, ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT"]);
  assert.deepEqual([c.BTCUSDT.multiplier, c.ETHUSDT.multiplier, c.SOLUSDT.multiplier, c.DOGEUSDT.multiplier], [1, 0, 1, 1]);
});

test("paper broker state survives a restart", () => {
  const f = join(mkdtempSync(join(tmpdir(), "jev-")), "b.json");
  const b = new PaperBroker(1000, 25, 1, f);
  b.submit("X", "buy", 500, { symbol: "X", ts: 0, bid: 99, ask: 101, bidSize: 1, askSize: 1 });
  const b2 = new PaperBroker(1000, 25, 1, f);
  assert.equal(b2.positionQty("X"), b.positionQty("X"));
  assert.equal(b2.cash(), b.cash());
});

function harness(probBuy: () => number) {
  let t = 0, placed: { usd: number; why: string }[] = [], pos = 0;
  const ex = new Executor({ windowMin: 40, slices: 4, checkSec: 20, waitConfidence: 0.65, minOrderUsd: 10 }, {
    model: { name: "m", decide: async () => ({ action: probBuy() >= 0.5 ? "buy" : "sell", confidence: Math.max(probBuy(), 1 - probBuy()), probabilities: { buy: probBuy(), sell: 1 - probBuy() }, latencyMs: 1 }) },
    state: () => ({ mid: 100 } as any), mid: () => 100, positionUsd: () => pos,
    place: async (_s, side, usd, why) => { placed.push({ usd, why }); pos += side === "buy" ? usd : -usd; return { symbol: "X", side, qty: usd / 100, price: 100, fee: 0, ts: t }; },
  }, () => t);
  return { ex, placed, advance: async (ms: number, step = 1000) => { for (let e = 0; e < ms; e += step) { t += step; await ex.onTick("X"); } } };
}

test("executor: Jev favourable -> slices go out on schedule", async () => {
  const h = harness(() => 0.8);
  h.ex.submit("X", "buy", 400, "test");
  await h.advance(41 * 60_000);
  assert.equal(h.placed.length, 4);
  assert.ok(h.placed.every((p) => p.why.includes("jev-timed")));
  assert.ok(Math.abs(h.placed.reduce((a, p) => a + p.usd, 0) - 400) < 1e-6);
  assert.equal(h.ex.jobs.size, 0);
});

test("executor: Jev strongly against us -> waits, but the deadline still completes the order", async () => {
  const h = harness(() => 0.1); // expects a drop while we want to buy
  h.ex.submit("X", "buy", 400, "test");
  await h.advance(45 * 60_000);
  assert.ok(Math.abs(h.placed.reduce((a, p) => a + p.usd, 0) - 400) < 1e-6);
  assert.ok(h.placed.every((p) => p.why.includes("deadline")));
  assert.ok(h.ex.stats.waits > 10);
});

test("executor: a refused slice is retried, not abandoned", async () => {
  let t = 0, refuse = 3, got = 0;
  const ex = new Executor({ windowMin: 4, slices: 2, checkSec: 5, waitConfidence: 0.65, minOrderUsd: 10 }, {
    model: { name: "m", decide: async () => ({ action: "buy", confidence: 0.6, probabilities: { buy: 0.6, sell: 0.4 }, latencyMs: 1 }) },
    state: () => ({ mid: 100 } as any), mid: () => 100, positionUsd: () => 0,
    place: async (_s, side, usd) => { if (refuse-- > 0) return null; got += usd; return { symbol: "X", side, qty: usd / 100, price: 100, fee: 0, ts: t }; },
  }, () => t);
  ex.submit("X", "buy", 200, "test");
  for (let i = 0; i < 400; i++) { t += 1000; await ex.onTick("X"); }
  assert.equal(got, 200);
  assert.equal(ex.stats.cancelled, 0);
});

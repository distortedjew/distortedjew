import assert from "node:assert/strict";
import { test } from "node:test";
import { summarize } from "../src/market-data.js";
import { extractJson, sanitizePlan } from "../src/strategist.js";
import { Telemetry } from "../src/telemetry.js";

test("extracts JSON from a chatty or fenced reply", () => {
  assert.deepEqual(extractJson('Sure!\n```json\n{"plans":[{"symbol":"BTCUSDT"}]}\n```'), { plans: [{ symbol: "BTCUSDT" }] });
  assert.throws(() => extractJson("no idea"));
});

test("sanitizes a hostile or confused plan", () => {
  const p = sanitizePlan({ bias: "short", conviction: 7, size: 3, stopLossPct: 50, takeProfitPct: -1, maxHoldMin: 99999 }, "X", 0, 60);
  assert.equal(p.bias, "flat"); // unknown bias never becomes a trade
  assert.equal(p.size, 0);      // flat never holds
  assert.equal(p.conviction, 1);
  assert.equal(p.stopLossPct, 5);
  assert.ok(p.takeProfitPct >= p.stopLossPct);
  assert.equal(p.maxHoldMin, 720);
  assert.equal(p.expiresAt, 60 * 60_000);
});

test("keeps a sensible long plan", () => {
  const p = sanitizePlan({ bias: "long", conviction: 0.7, size: 0.5, stopLossPct: 1.2, takeProfitPct: 2.5, maxHoldMin: 90, reason: "trend" }, "X", 0, 60);
  assert.deepEqual([p.bias, p.size, p.stopLossPct, p.takeProfitPct, p.maxHoldMin], ["long", 0.5, 1.2, 2.5, 90]);
});

test("summarizes candles", () => {
  const ks = Array.from({ length: 60 }, (_, i) => ({ o: 100 + i, h: 101 + i, l: 99 + i, c: 100.5 + i, v: i === 59 ? 20 : 10 }));
  const s = summarize(ks);
  assert.ok(s.changePct > 0 && s.vsEma20Pct > 0);
  assert.equal(s.rsi14, 100);   // straight up
  assert.equal(s.volumeVsAvg, 2);
  assert.ok(s.rangePosition > 0.9);
});

test("scorecard checks each call once its horizon passes", async () => {
  const t = new Telemetry();
  const d = (buy: number) => ({ action: buy >= 0.5 ? "buy" : "sell", confidence: Math.max(buy, 1 - buy), probabilities: { buy, sell: 1 - buy }, latencyMs: 1 }) as const;
  t.scoreOpen("X", 100, d(0.8), 0, 0.7);   // predicts up, confident
  t.scoreOpen("X", 100, d(0.4), 0, 0.7);   // predicts down, not confident
  await new Promise((r) => setTimeout(r, 5));
  t.scoreMature("X", 101);                  // price went up
  const s = t.scoreTotals();
  assert.equal(s.n, 2);
  assert.equal(s.hitRate, 0.5);
  assert.equal(s.confHitRate, 1);
});

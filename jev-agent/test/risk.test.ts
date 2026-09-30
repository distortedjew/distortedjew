import assert from "node:assert/strict";
import { test } from "node:test";
import { PaperBroker } from "../src/broker.js";
import { Risk } from "../src/risk.js";

const cfg = { maxPositionUsd: 1000, maxTotalExposureUsd: 1500, maxOrdersPerMin: 3, dailyLossLimitUsd: 100 };
const view = (o = {}) => ({ symbolUsd: 0, totalUsd: 0, equity: 10000, ...o });

test("caps buys at the per-symbol limit", () => {
  const r = new Risk(cfg).check({ symbol: "X", side: "buy", usd: 5000 }, view({ symbolUsd: 600 }));
  assert.equal(r.order?.usd, 400);
});
test("caps buys at total exposure", () => {
  const r = new Risk(cfg).check({ symbol: "X", side: "buy", usd: 900 }, view({ totalUsd: 1400 }));
  assert.equal(r.order?.usd, 100);
});
test("never shorts", () => {
  assert.equal(new Risk(cfg).check({ symbol: "X", side: "sell", usd: 100 }, view()).order, null);
});
test("rate limit", () => {
  const risk = new Risk(cfg);
  for (let i = 0; i < 3; i++) assert.ok(risk.check({ symbol: "X", side: "buy", usd: 10 }, view()).order);
  assert.equal(risk.check({ symbol: "X", side: "buy", usd: 10 }, view()).reason, "order rate limit");
});
test("daily loss halts buys but allows closing", () => {
  const risk = new Risk(cfg);
  risk.check({ symbol: "X", side: "buy", usd: 10 }, view());
  assert.equal(risk.check({ symbol: "X", side: "buy", usd: 10 }, view({ equity: 9890 })).order, null);
  assert.ok(risk.check({ symbol: "X", side: "sell", usd: 10 }, view({ equity: 9890, symbolUsd: 50 })).order);
});
test("paper broker charges spread, fee and slippage", () => {
  const b = new PaperBroker(1000, 10, 1);
  const q = { symbol: "X", ts: 0, bid: 99, ask: 101, bidSize: 1, askSize: 1 };
  b.submit("X", "buy", 500, q);
  b.submit("X", "sell", 500, q);
  assert.ok(b.equity({ X: 100 }) < 1000 - 5); // round trip loses at least the spread
});

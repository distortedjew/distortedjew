import assert from "node:assert/strict";
import { test } from "node:test";
import { Executor } from "../src/executor.js";
import { KeywordClassifier, NewsReflex, parseFeed, type Classifier } from "../src/news-reflex.js";
import { Scorecard } from "../src/scorecard.js";
import { Telemetry } from "../src/telemetry.js";

const rss = (items: { t: string; l: string; d: Date }[]) => `<?xml version="1.0"?><rss><channel>${items.map((i) =>
  `<item><title><![CDATA[${i.t}]]></title><link>${i.l}</link><pubDate>${i.d.toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;

test("parses RSS (CDATA, entities) and Atom, and drops non-http links", () => {
  const r = parseFeed(rss([{ t: "Bitcoin &amp; Ether rally", l: "https://x.com/a", d: new Date() }, { t: "Evil", l: "javascript:alert(1)", d: new Date() }]), "x.com");
  assert.equal(r[0].title, "Bitcoin & Ether rally");
  assert.equal(r[0].link, "https://x.com/a");
  assert.equal(r[1].link, "");
  const atom = parseFeed(`<feed><entry><title>Solana hacked</title><link href="https://y.com/b"/><updated>${new Date().toISOString()}</updated></entry></feed>`, "y.com");
  assert.deepEqual([atom[0].title, atom[0].link], ["Solana hacked", "https://y.com/b"]);
});

test("keyword fallback is conservative", async () => {
  const k = new KeywordClassifier(), c = ["BTC", "ETH", "SOL"];
  const v = async (t: string) => k.classify({ id: "1", title: t, link: "", source: "s", published: Date.now() }, c);
  assert.deepEqual(await v("Solana DeFi protocol drained in $40M exploit").then((x) => [x.coin, x.impact]), ["SOL", "severe"]);
  assert.deepEqual(await v("Major exchange halts withdrawals amid insolvency fears").then((x) => [x.coin, x.impact]), ["market", "severe"]);
  assert.equal((await v("Bitcoin price consolidates near $84k")).impact, "neutral");
  assert.equal((await v("Ether ETF inflows hit record high")).impact, "positive");
});

function reflexHarness(feed: () => string, classifier: Classifier = new KeywordClassifier()) {
  let t = Date.parse("2026-10-03T12:00:00Z");
  const cuts: string[][] = [];
  const r = new NewsReflex({ feeds: ["https://feed.test/rss"], pollSec: 60, maxAgeMin: 30, severeConfidence: 0.7, cutTo: 0, cutHours: 12 },
    ["BTC", "ETH", "SOL"], classifier, (c) => cuts.push(c), async () => feed(), () => t);
  return { r, cuts, advance: (ms: number) => { t += ms; }, now: () => t };
}

test("reflex: a fresh severe headline cuts that coin immediately, then expires", async () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  const h = reflexHarness(() => rss([{ t: "Solana bridge hacked, $120M stolen", l: "https://n.test/1", d: new Date(now - 60_000) }]));
  await h.r.poll();
  assert.deepEqual(h.cuts, [["SOL"]]);
  assert.equal(h.r.multiplier("SOL"), 0);
  assert.equal(h.r.multiplier("BTC"), 1);
  await h.r.poll(); // same headline again: not re-processed
  assert.equal(h.cuts.length, 1);
  h.advance(13 * 3600_000);
  assert.equal(h.r.multiplier("SOL"), 1);
});

test("reflex: old news and non-severe news never cut; market-wide news cuts everything", async () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  let items = [{ t: "Ethereum exploit drains wallets", l: "https://n.test/old", d: new Date(now - 3 * 3600_000) }, { t: "Bitcoin dips 2% on outflows", l: "https://n.test/neg", d: new Date(now) }];
  const h = reflexHarness(() => rss(items));
  await h.r.poll();
  assert.equal(h.cuts.length, 0);
  items = [{ t: "Top crypto exchange halts withdrawals", l: "https://n.test/mkt", d: new Date(now) }];
  await h.r.poll();
  assert.deepEqual(h.cuts, [["market"]]);
  assert.equal(h.r.multiplier("BTC"), 0);
  assert.equal(h.r.multiplier("ETH"), 0);
});

test("reflex: a low-confidence 'severe' verdict does not cut, and a classifier failure falls back to keywords", async () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  const unsure: Classifier = { name: "x", classify: async () => ({ coin: "BTC", impact: "severe", confidence: 0.55, latencyMs: 1 }) };
  const h = reflexHarness(() => rss([{ t: "Rumour about bitcoin", l: "https://n.test/r", d: new Date(now) }]), unsure);
  await h.r.poll();
  assert.equal(h.cuts.length, 0);
  const broken: Classifier = { name: "x", classify: async () => { throw new Error("timeout"); } };
  const h2 = reflexHarness(() => rss([{ t: "Ethereum protocol exploited for $50M", l: "https://n.test/e", d: new Date(now) }]), broken);
  await h2.r.poll();
  assert.deepEqual(h2.cuts, [["ETH"]]);
});

test("executor: urgent orders go out in one slice on the next tick, without asking Jev", async () => {
  let asked = 0, placed: number[] = [];
  const ex = new Executor({ windowMin: 60, slices: 4, checkSec: 20, waitConfidence: 0.65, minOrderUsd: 10 }, {
    model: { name: "m", decide: async () => { asked++; return { action: "sell", confidence: 0.9, probabilities: { buy: 0.9, sell: 0.1 }, latencyMs: 1 }; } },
    state: () => ({ mid: 100 } as any), mid: () => 100, positionUsd: () => 500,
    place: async (_s, side, usd) => { placed.push(usd); return { symbol: "X", side, qty: usd / 100, price: 100, fee: 0, ts: 0 }; },
  }, () => 1000);
  ex.submit("X", "sell", 500, "news", true, true);
  await ex.onTick("X");
  assert.equal(asked, 0);
  assert.equal(placed.length, 1);
  assert.ok(placed[0] >= 500);
  assert.equal(ex.jobs.size, 0);
});

test("scorecard rotates coins, one call at a time, and records each call", async () => {
  const seen: string[] = [];
  const sc = new Scorecard({
    model: { name: "m", decide: async () => ({ action: "buy", confidence: 0.6, probabilities: { buy: 0.6, sell: 0.4 }, latencyMs: 1 }) },
    symbols: ["A", "B", "C"], state: (s) => ({ mid: 1, symbol: s } as any), record: (s) => seen.push(s),
  }, 15);
  for (let i = 0; i < 6; i++) await sc.tick();
  assert.deepEqual(seen, ["A", "B", "C", "A", "B", "C"]);
});

test("telemetry: confidence buckets record the move in the predicted direction", async () => {
  const t = new Telemetry();
  const d = (buy: number) => ({ action: buy >= 0.5 ? "buy" : "sell", confidence: Math.max(buy, 1 - buy), probabilities: { buy, sell: 1 - buy }, latencyMs: 1 }) as const;
  t.scoreOpen("X", 100, d(0.75), 0, 0.6); // predicts up, 75%
  t.scoreOpen("X", 100, d(0.45), 0, 0.6); // predicts down, 55%
  await new Promise((r) => setTimeout(r, 5));
  t.scoreMature("X", 100.1); // +10 bps
  const s = t.scoreTotals();
  assert.equal(s.buckets["70%+"].n, 1);
  assert.ok(Math.abs(s.buckets["70%+"].avgMoveBps! - 10) < 1e-6);
  assert.ok(Math.abs(s.buckets["50-60%"].avgMoveBps! + 10) < 1e-6);
  assert.equal(s.z, 0); // 1 hit of 2
});

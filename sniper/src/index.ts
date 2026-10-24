import { appendFileSync, mkdirSync } from "node:fs";
import { loadConfig } from "./config.ts";
import { evaluateEntry } from "./filters.ts";
import { PaperPortfolio } from "./paper.ts";
import { fetchNewSolanaMints, fetchPairs, fetchSecurity } from "./sources.ts";

const cfg = loadConfig();
const portfolio = new PaperPortfolio(cfg);
const seen = new Set<string>();
const prices = new Map<string, number>();
mkdirSync("logs", { recursive: true });
const log = (event: string, data: object) => {
  const line = JSON.stringify({ t: new Date().toISOString(), event, ...data });
  console.log(line);
  appendFileSync("logs/trades.jsonl", line + "\n");
};

async function tick() {
  const now = Date.now();

  // 1. Manage open positions.
  const open = [...portfolio.positions.keys()];
  if (open.length) {
    for (const p of await fetchPairs(open, now)) {
      prices.set(p.mint, p.priceUsd);
      for (const t of portfolio.onPrice(p.mint, p.priceUsd, now)) log("exit", t);
    }
  }

  // 2. Look for new candidates.
  const fresh = (await fetchNewSolanaMints()).filter((m) => !seen.has(m));
  if (!fresh.length) return;
  for (const pair of await fetchPairs(fresh, now)) {
    seen.add(pair.mint);
    if (!portfolio.canOpen(pair.mint, now)) continue;
    let verdict;
    try {
      verdict = evaluateEntry(pair, await fetchSecurity(pair.mint), cfg);
    } catch (e) {
      log("skip", { mint: pair.mint, reason: `security lookup failed: ${(e as Error).message}` });
      continue;
    }
    if (!verdict.ok) {
      log("skip", { mint: pair.mint, symbol: pair.symbol, reason: verdict.reason });
      continue;
    }
    const pos = portfolio.open(pair.mint, pair.symbol, pair.priceUsd, now);
    if (pos) log("entry", { mint: pos.mint, symbol: pos.symbol, price: pos.entryPrice, sizeUsd: pos.sizeUsd });
  }
  log("status", {
    equityUsd: +portfolio.equity(prices).toFixed(2),
    open: portfolio.positions.size,
    realizedPnlUsd: +portfolio.totalPnlUsd.toFixed(2),
  });
}

console.log("PAPER TRADING ONLY - no wallet, no keys, no real orders.", cfg);
for (;;) {
  try {
    await tick();
  } catch (e) {
    log("error", { message: (e as Error).message });
  }
  await new Promise((r) => setTimeout(r, cfg.pollIntervalMs));
}

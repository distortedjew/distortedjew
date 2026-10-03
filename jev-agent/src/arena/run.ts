/**
 * Arena CLI.
 *   npx tsx src/arena/run.ts --arena crypto --strategy src/arena/strategies/my-strategy.ts --split train
 *   npx tsx src/arena/run.ts --arena etf    --strategy src/arena/strategies/my-strategy.ts --split validation
 * Prints a metrics table and a JSON line (prefix "RESULT ") for machine parsing.
 * The holdout split is reserved for the tournament organiser.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { run, type ArenaName, type Split } from "./harness.js";

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const arena = arg("arena") as ArenaName, split = (arg("split", "train") as Split), file = arg("strategy");
if (!arena || !file) { console.error("usage: --arena crypto|etf --strategy <file.ts> --split train|validation"); process.exit(1); }
if ((split === "holdout" || split === "all") && process.env.ARENA_ORGANISER !== "1") { console.error("the holdout is sealed: only the tournament organiser may run it"); process.exit(1); }
const mod = await import(pathToFileURL(resolve(file)).href);
const strat = mod.default;
const t0 = Date.now();
const r = run(strat, arena, split, arg("data"));
const pct = (x: number) => (x * 100).toFixed(1) + "%";
console.log(`${r.strategy} | ${arena} ${split} ${r.from}..${r.to} | CAGR ${pct(r.cagr)} | Sharpe ${r.sharpe.toFixed(2)} | Sortino ${r.sortino.toFixed(2)} | MaxDD ${pct(r.maxDD)} | Vol ${pct(r.vol)} | AvgExp ${pct(r.avgExposure)} | trades/yr ${r.tradesPerYear.toFixed(0)} | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const { equity, ...rest } = r;
console.log("RESULT " + JSON.stringify(rest));

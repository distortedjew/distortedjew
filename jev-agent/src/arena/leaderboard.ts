/**
 * Organiser tool: re-runs every strategy in src/arena/strategies (each split in its own process, so
 * module state never leaks between runs), computes score = min(train, validation Sharpe) and writes
 * src/arena/LEADERBOARD.md. Arena by file name: *-crypto-* -> crypto, *-etf-* -> etf, others -> both.
 *   npx tsx src/arena/leaderboard.ts
 *   ARENA_ORGANISER=1 npx tsx src/arena/leaderboard.ts --holdout <cryptoDir> <etfDir> --only a,b   (sealed final test)
 */
import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";

const files = readdirSync("src/arena/strategies").filter((f) => f.endsWith(".ts")).sort();
const hi = process.argv.indexOf("--holdout");
const holdoutDirs = hi > 0 ? { crypto: process.argv[hi + 1], etf: process.argv[hi + 2] } : null;
const oi = process.argv.indexOf("--only");
const only = oi > 0 ? new Set(process.argv[oi + 1].split(",")) : null;

const runOne = (file: string, arena: string, split: string, data?: string) => {
  const args = ["tsx", "src/arena/run.ts", "--arena", arena, "--strategy", `src/arena/strategies/${file}`, "--split", split, ...(data ? ["--data", data] : [])];
  try {
    const out = execFileSync("npx", args, { encoding: "utf8", timeout: 180_000, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    const line = out.split("\n").find((l) => l.startsWith("RESULT "));
    return line ? JSON.parse(line.slice(7)) : { error: "no RESULT" };
  } catch (e) { return { error: String((e as any).stderr ?? e).slice(0, 200) }; }
};

const rows: any[] = [];
for (const f of files) {
  const id = f.replace(/\.ts$/, "");
  if (only && !only.has(id)) continue;
  const arenas = id.includes("-crypto-") ? ["crypto"] : id.includes("-etf-") ? ["etf"] : ["crypto", "etf"];
  for (const a of arenas) {
    const tr = runOne(f, a, "train"), va = runOne(f, a, "validation");
    const hold = holdoutDirs ? runOne(f, a, "holdout", (holdoutDirs as any)[a]) : null;
    const score = tr.error || va.error ? -99 : Math.min(tr.sharpe, va.sharpe);
    rows.push({ id, arena: a, score, tr, va, hold });
    process.stderr.write(`${a.padEnd(7)} ${id.padEnd(28)} score ${score.toFixed(2)}${tr.error || va.error ? "  ERROR " + (tr.error || va.error) : ""}\n`);
  }
}
const pct = (x?: number) => (x === undefined ? "–" : (x * 100).toFixed(1) + "%");
let md = `# Arena leaderboard\n\nscore = min(train Sharpe, validation Sharpe). Re-run by the organiser; generated ${new Date().toISOString().slice(0, 16)} UTC.\n`;
for (const a of ["crypto", "etf"]) {
  const r = rows.filter((x) => x.arena === a).sort((x, y) => y.score - x.score || (y.va.cagr ?? 0) - (x.va.cagr ?? 0));
  md += `\n## ${a}\n\n| # | strategy | score | train Sharpe | val Sharpe | val CAGR | val MaxDD | val trades/yr |${holdoutDirs ? " HOLDOUT Sharpe | HOLDOUT CAGR | HOLDOUT MaxDD |" : ""}\n|---|---|---|---|---|---|---|---|${holdoutDirs ? "---|---|---|" : ""}\n`;
  r.forEach((x, i) => {
    md += `| ${i + 1} | ${x.id} | ${x.score.toFixed(2)} | ${x.tr.sharpe?.toFixed(2) ?? "err"} | ${x.va.sharpe?.toFixed(2) ?? "err"} | ${pct(x.va.cagr)} | ${pct(x.va.maxDD)} | ${x.va.tradesPerYear?.toFixed(0) ?? "–"} |`;
    if (holdoutDirs) md += ` ${x.hold?.sharpe?.toFixed(2) ?? "err"} | ${pct(x.hold?.cagr)} | ${pct(x.hold?.maxDD)} |`;
    md += "\n";
  });
}
writeFileSync(holdoutDirs ? "src/arena/HOLDOUT.md" : "src/arena/LEADERBOARD.md", md);
console.log(md);

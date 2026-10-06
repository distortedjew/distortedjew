import { Connection, LAMPORTS_PER_SOL, PublicKey, type Keypair } from "@solana/web3.js";
import { MINTS, loadConfig } from "./config.js";
import { Jupiter } from "./jupiter.js";
import { attemptCostLamports, evaluateCycle, fromUnits, routeLabel, toUnits, type Opportunity } from "./arb.js";
import { Executor, ata, loadKeypair } from "./executor.js";
import { Risk } from "./risk.js";

const cfg = loadConfig();
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 23), ...a);
const jup = new Jupiter(cfg.jupiterUrl, cfg.jupiterApiKey);
const conn = new Connection(cfg.rpcUrl, "confirmed");
const risk = new Risk(cfg.risk);
const kp: Keypair | null = cfg.wallet ? loadKeypair(cfg.wallet) : null;
if (cfg.live && !kp) throw new Error("LIVE=on needs WALLET");
const exec = kp ? new Executor(conn, jup, kp, cfg, cfg.live) : null;

const amountIn = toUnits(cfg.tradeSize, cfg.baseDecimals);
const minProfit = toUnits(cfg.minProfit, cfg.baseDecimals);
const costLamports = attemptCostLamports(cfg);
const baseIsSol = cfg.baseMint === MINTS.SOL;
let baseUnitsPerSol = baseIsSol ? BigInt(LAMPORTS_PER_SOL) : 0n;
let solBalance = 0;
let cursor = 0;
let busy = false;
let backoffUntil = 0;
const stats = { ticks: 0, quotes: 0, errors: 0, opportunities: 0, sent: 0, landed: 0 };

const costInBase = () => (costLamports * baseUnitsPerSol) / BigInt(LAMPORTS_PER_SOL);
const baseToSol = (units: bigint) => (baseUnitsPerSol ? Number(units) / Number(baseUnitsPerSol) : 0);

async function refreshSolPrice() {
  if (baseIsSol) return;
  try {
    const q = await jup.quote({ inputMint: MINTS.SOL, outputMint: cfg.baseMint, amount: BigInt(LAMPORTS_PER_SOL), slippageBps: 50, maxAccounts: 64 });
    baseUnitsPerSol = BigInt(q.outAmount);
  } catch (e) {
    log(`SOL price refresh failed: ${(e as Error).message}`);
  }
}

async function refreshSolBalance() {
  if (kp) solBalance = (await conn.getBalance(kp.publicKey).catch(() => 0)) / LAMPORTS_PER_SOL;
}

async function baseBalance(): Promise<bigint> {
  if (!kp) return 0n;
  if (baseIsSol) return BigInt(await conn.getBalance(kp.publicKey));
  const r = await conn.getTokenAccountBalance(ata(kp.publicKey, new PublicKey(cfg.baseMint)));
  return BigInt(r.value.amount);
}

async function scan(mint: string): Promise<Opportunity | null> {
  const leg1 = await jup.quote({ inputMint: cfg.baseMint, outputMint: mint, amount: amountIn, slippageBps: cfg.leg1SlippageBps, maxAccounts: cfg.maxAccountsPerLeg });
  const leg2 = await jup.quote({ inputMint: mint, outputMint: cfg.baseMint, amount: BigInt(leg1.otherAmountThreshold), slippageBps: 0, maxAccounts: cfg.maxAccountsPerLeg });
  stats.quotes += 2;
  return evaluateCycle(leg1, leg2, costInBase(), minProfit);
}

async function tick() {
  if (busy || Date.now() < backoffUntil || !baseUnitsPerSol) return;
  busy = true;
  stats.ticks++;
  try {
    // Round-robin one intermediate per tick: two quotes/sec already sits near free-tier Jupiter limits.
    const mint = cfg.intermediates[cursor++ % cfg.intermediates.length];
    const opp = await scan(mint);
    if (!opp) return;
    stats.opportunities++;
    const dec = cfg.baseDecimals;
    log(`OPPORTUNITY ${fromUnits(opp.amountIn, dec)} -> ${fromUnits(opp.expectedOut, dec)} | net +${fromUnits(opp.expectedProfit, dec)} | ${routeLabel(opp.leg1)} / ${routeLabel(opp.leg2)}`);
    if (!exec) return;

    const blocked = cfg.live ? risk.check(solBalance) : "";
    if (blocked) return log(`  not sending: ${blocked}`);

    const before = cfg.live ? await baseBalance() : 0n;
    if (cfg.live) risk.recordSend();
    const r = await exec.execute(opp);
    if (r.status === "skipped") return log(`  ${r.reason}`);

    stats.sent++;
    const landed = r.status === "landed";
    // A Jito bundle that is never included costs nothing; an on-chain revert via RPC pays base + priority.
    const feeLamports = landed || !cfg.jito ? costLamports : 0n;
    const gain = landed ? (await baseBalance()) - before : 0n;
    if (landed) stats.landed++;
    risk.recordResult(landed, Number(feeLamports) / LAMPORTS_PER_SOL, baseIsSol ? 0 : baseToSol(gain));
    await refreshSolBalance();
    log(landed ? `  LANDED ${r.signature} | base Δ ${fromUnits(gain, dec)}` : `  FAILED ${r.signature}: ${r.reason}`);
    log(`  day net ${risk.dailyNetSol.toFixed(6)} SOL${risk.haltReason ? ` | HALTED: ${risk.haltReason}` : ""}`);
  } catch (e) {
    stats.errors++;
    const msg = (e as Error).message;
    if (msg.includes(" 429")) {
      backoffUntil = Date.now() + 5000;
      log("rate limited by Jupiter — backing off 5s (set JUPITER_API_KEY or raise TICK_MS)");
    } else log(`error: ${msg}`);
  } finally {
    busy = false;
  }
}

async function main() {
  log(`sol-arb | ${cfg.live ? "LIVE — real transactions" : kp ? "DRY RUN (quotes + simulation, nothing sent)" : "DRY RUN (quotes only, no wallet)"}`);
  log(`base ${cfg.baseMint.slice(0, 6)}… size ${cfg.tradeSize} | ${cfg.intermediates.length} intermediates | tick ${cfg.tickMs}ms | ${cfg.jito ? "Jito" : "RPC"} | cost/attempt ${costLamports} lamports`);
  if (kp) log(`wallet ${kp.publicKey.toBase58()}`);

  await Promise.all([refreshSolPrice(), refreshSolBalance(), exec?.start()]);
  if (!baseUnitsPerSol) throw new Error("could not price SOL in the base token — check JUPITER_URL / network");
  if (cfg.live) log(`SOL ${solBalance.toFixed(4)} | base ${fromUnits(await baseBalance(), cfg.baseDecimals)}`);

  const timers = [
    setInterval(tick, cfg.tickMs),
    setInterval(refreshSolPrice, 30_000),
    setInterval(refreshSolBalance, 30_000),
    setInterval(() => log(`stats ${JSON.stringify(stats)} | day net ${risk.dailyNetSol.toFixed(6)} SOL`), 60_000),
  ];
  const shutdown = () => {
    timers.forEach(clearInterval);
    exec?.stop();
    log(`stopped. ${JSON.stringify(stats)}`);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

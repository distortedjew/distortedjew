import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import { attemptCostLamports, evaluateCycle, toUnits } from "../src/arb.js";
import { assemble, dedupe } from "../src/executor.js";
import { Risk } from "../src/risk.js";
import type { JupInstruction, Quote, SwapInstructions } from "../src/jupiter.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL = "So11111111111111111111111111111111111111112";
const q = (inputMint: string, outputMint: string, inAmount: bigint, outAmount: bigint, threshold = outAmount): Quote => ({
  inputMint, outputMint, inAmount: inAmount.toString(), outAmount: outAmount.toString(), otherAmountThreshold: threshold.toString(),
  swapMode: "ExactIn", slippageBps: 0, priceImpactPct: "0", routePlan: [{ swapInfo: { label: "Orca", ammKey: "x" } }],
});

test("attempt cost = base fee + priority fee (rounded up) + tip", () => {
  assert.equal(attemptCostLamports({ computeUnitLimit: 600_000, priorityMicroLamports: 20_000, jito: true, jitoTipLamports: 10_000 }), 5000n + 12_000n + 10_000n);
  assert.equal(attemptCostLamports({ computeUnitLimit: 1, priorityMicroLamports: 1, jito: false, jitoTipLamports: 10_000 }), 5001n);
});

test("rejects a cycle that does not clear input + costs + min profit", () => {
  const leg1 = q(USDC, SOL, 50_000_000n, 300_000_000n);
  assert.equal(evaluateCycle(leg1, q(SOL, USDC, 300_000_000n, 50_010_000n), 5_000n, 10_000n), null); // 50.01 < 50.015
});

test("accepts a profitable cycle and locks leg 2's minimum-out at or above required", () => {
  const leg1 = q(USDC, SOL, 50_000_000n, 300_000_000n);
  const opp = evaluateCycle(leg1, q(SOL, USDC, 300_000_000n, 50_100_000n), 5_000n, 20_000n);
  assert.ok(opp);
  assert.equal(opp.required, 50_025_000n);
  assert.equal(opp.expectedProfit, 95_000n);
  assert.ok(BigInt(opp.leg2.otherAmountThreshold) >= opp.required);
  assert.ok(BigInt(opp.leg2.otherAmountThreshold) <= opp.expectedOut);
  // Consistency with how Jupiter derives the threshold from slippageBps.
  assert.equal(BigInt(opp.leg2.otherAmountThreshold), (opp.expectedOut * BigInt(10_000 - opp.leg2.slippageBps)) / 10_000n);
});

test("threshold never drops below required across many random cycles", () => {
  for (let i = 0; i < 5000; i++) {
    const inAmt = BigInt(1 + Math.floor(Math.random() * 1e9));
    const out = inAmt + BigInt(Math.floor(Math.random() * 1e7));
    const opp = evaluateCycle(q(USDC, SOL, inAmt, 7n), q(SOL, USDC, 7n, out), BigInt(Math.floor(Math.random() * 1e5)), 1n);
    if (opp) assert.ok(BigInt(opp.leg2.otherAmountThreshold) >= opp.required, `i=${i}`);
  }
});

test("rejects mismatched legs or leg 2 spending more than leg 1 guarantees", () => {
  const leg1 = q(USDC, SOL, 50_000_000n, 300_000_000n, 299_000_000n);
  assert.equal(evaluateCycle(leg1, q(SOL, USDC, 300_000_000n, 60_000_000n), 0n, 0n), null);
  assert.equal(evaluateCycle(leg1, q(USDC, SOL, 299_000_000n, 60_000_000n), 0n, 0n), null);
  assert.ok(evaluateCycle(leg1, q(SOL, USDC, 299_000_000n, 60_000_000n), 0n, 0n));
});

test("toUnits avoids float drift", () => {
  assert.equal(toUnits(0.02, 6), 20_000n);
  assert.equal(toUnits(50, 6), 50_000_000n);
});

const ix = (data: string): JupInstruction => ({ programId: PublicKey.default.toBase58(), accounts: [], data: Buffer.from(data).toString("base64") });
const swap = (name: string, cleanup?: string): SwapInstructions => ({
  setupInstructions: [ix("create-ata-SOL")], swapInstruction: ix(name), cleanupInstruction: cleanup ? ix(cleanup) : null, addressLookupTableAddresses: [],
});

test("dedupe keeps one copy of shared setup instructions", () => {
  assert.equal(dedupe([ix("a"), ix("a"), null, ix("b")]).length, 2);
});

test("assemble orders compute budget, setup, leg1, leg2, cleanup, tip", () => {
  const payer = Keypair.generate().publicKey;
  const ixs = assemble(swap("leg1", "close"), swap("leg2", "close"), { computeUnitLimit: 1, priorityMicroLamports: 1, jito: true, jitoTipLamports: 1000 }, payer);
  const names = ixs.slice(2, -1).map((i) => i.data.toString());
  assert.deepEqual(names, ["create-ata-SOL", "leg1", "leg2", "close"]);
  assert.equal(ixs.at(-1)!.programId.toBase58(), "11111111111111111111111111111111"); // system transfer = Jito tip
  assert.equal(assemble(swap("a"), swap("b"), { computeUnitLimit: 1, priorityMicroLamports: 1, jito: false, jitoTipLamports: 0 }, payer).length, 5);
});

test("risk: per-minute cap, daily loss halt with UTC reset, consecutive failure halt", () => {
  let t = Date.parse("2026-10-06T12:00:00Z");
  const r = new Risk({ maxTradesPerMin: 2, dailyLossLimitSol: 0.01, maxConsecutiveFailures: 3, minSolBalance: 0.02 }, () => t);
  assert.match(r.check(0.01), /MIN_SOL_BALANCE/);
  r.recordSend(); r.recordSend();
  assert.match(r.check(1), /PER_MIN/);
  t += 61_000;
  assert.equal(r.check(1), "");

  r.recordResult(true, 0.006, 0);
  r.recordResult(true, 0.006, 0);
  assert.match(r.check(1), /daily loss/);
  t = Date.parse("2026-10-07T00:00:01Z");
  assert.equal(r.check(1), "");

  r.recordResult(false, 0, 0); r.recordResult(false, 0, 0);
  assert.equal(r.check(1), "");
  r.recordResult(false, 0, 0);
  assert.match(r.check(1), /consecutive/);
});

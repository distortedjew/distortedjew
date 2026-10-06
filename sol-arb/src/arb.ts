import type { Quote } from "./jupiter.js";

export const LAMPORTS_PER_SIGNATURE = 5000n;

/** Total lamports one attempt costs: base fee + priority fee + optional Jito tip. */
export function attemptCostLamports(c: { computeUnitLimit: number; priorityMicroLamports: number; jito: boolean; jitoTipLamports: number }) {
  const priority = (BigInt(c.computeUnitLimit) * BigInt(c.priorityMicroLamports) + 999_999n) / 1_000_000n;
  return LAMPORTS_PER_SIGNATURE + priority + (c.jito ? BigInt(c.jitoTipLamports) : 0n);
}

export interface Opportunity {
  leg1: Quote;
  /** Leg 2 with slippage tightened so it reverts unless the cycle clears `required`. */
  leg2: Quote;
  amountIn: bigint;
  expectedOut: bigint;
  /** Minimum base units leg 2 must return: input + fees + min profit. */
  required: bigint;
  /** Expected profit net of fees, in base units. */
  expectedProfit: bigint;
}

/**
 * Decide whether a base -> X -> base cycle is worth taking, and if so return leg 2 with its
 * minimum-out raised to `required`. That makes the transaction atomic: it lands profitable or reverts.
 */
export function evaluateCycle(
  leg1: Quote,
  leg2: Quote,
  costInBaseUnits: bigint,
  minProfitUnits: bigint,
): Opportunity | null {
  const amountIn = BigInt(leg1.inAmount);
  const expectedOut = BigInt(leg2.outAmount);
  if (leg1.outputMint !== leg2.inputMint || leg2.outputMint !== leg1.inputMint) return null;
  if (BigInt(leg2.inAmount) > BigInt(leg1.otherAmountThreshold)) return null; // leg 2 would spend more than leg 1 guarantees
  const required = amountIn + costInBaseUnits + minProfitUnits;
  if (expectedOut < required) return null;

  // Largest slippage that still guarantees `required`; rounding down keeps the threshold >= required.
  const slippageBps = Number(((expectedOut - required) * 10_000n) / expectedOut);
  const threshold = (expectedOut * BigInt(10_000 - slippageBps)) / 10_000n;
  return {
    leg1,
    leg2: { ...leg2, slippageBps, otherAmountThreshold: threshold.toString() },
    amountIn,
    expectedOut,
    required,
    expectedProfit: expectedOut - amountIn - costInBaseUnits,
  };
}

export const toUnits = (whole: number, decimals: number) => BigInt(Math.round(whole * 10 ** decimals));
export const fromUnits = (units: bigint, decimals: number) => Number(units) / 10 ** decimals;
export const routeLabel = (q: Quote) => q.routePlan.map((r) => r.swapInfo.label ?? r.swapInfo.ammKey.slice(0, 4)).join(">");

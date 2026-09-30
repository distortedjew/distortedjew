import { experimental_evaluate } from "ai";
import { typeSafeAi } from "@ai-sdk/typesafe-ai";
import { config } from "./config.js";
import type { Decision, MarketState, Model } from "./types.js";

// Jev answers a typed question from a state object: no prose, one parallel pass, 70-500 ms.
const QUESTIONS = {
  direction: {
    type: "choice",
    instructions: {
      question: "Will the mid price be higher or lower than now after `horizonSec` seconds?",
      goal: "Short-horizon trading. Each trade pays the spread (`spreadBps`) plus fees, so the expected move must beat that cost. If unsure, the market is a coin flip.",
      inputs:
        "`trades.cvd` (taker buy volume minus taker sell volume) and `bookImbalance` are the strongest short-term signals. `returnsBps` shows recent momentum. `position` is what we already hold. `plan`, when present, is a slower strategist's view of the bigger picture (trend, positioning, news); weigh it as context, but judge the next `horizonSec` seconds on the order flow.",
    },
    criteria: {
      buy: "Mid is more likely to be higher after `horizonSec` seconds, by more than the trading cost.",
      sell: "Mid is more likely to be lower after `horizonSec` seconds, by more than the trading cost.",
    },
  },
} as const;

export class JevModel implements Model {
  readonly name = config.jevModelId;
  private model = typeSafeAi.evaluationModel(config.jevModelId);

  async decide(state: MarketState): Promise<Decision> {
    const t0 = performance.now();
    const r = await experimental_evaluate({ model: this.model, state: state as any, questions: QUESTIONS, maxRetries: 0,
      // A hung call would freeze this symbol; anything this slow is discarded as stale anyway.
      abortSignal: AbortSignal.timeout(config.maxLatencyMs * 2) });
    const a = r.answers.direction;
    const p = a.probabilities ?? { buy: 0, sell: 0, [a.choice]: 1 };
    const buy = p.buy ?? 0, sell = p.sell ?? 0;
    return {
      action: a.choice as Decision["action"],
      confidence: a.choice === "buy" ? buy : sell,
      probabilities: { buy, sell },
      latencyMs: performance.now() - t0,
    };
  }
}

/** Deterministic stand-in (momentum + flow + book imbalance) so the pipeline runs with no API key. */
export class MockModel implements Model {
  readonly name = "mock";
  async decide(s: MarketState): Promise<Decision> {
    const t0 = performance.now();
    const vol = s.trades.buyVol + s.trades.sellVol;
    const flow = vol ? s.trades.cvd / vol : 0;
    const signal = s.returnsBps.last15s / 6 + s.bookImbalance * 1.5 + flow * 2;
    const buy = 1 / (1 + Math.exp(-signal));
    await new Promise((r) => setTimeout(r, 80)); // stand in for inference time
    return {
      action: buy >= 0.5 ? "buy" : "sell",
      confidence: Math.max(buy, 1 - buy),
      probabilities: { buy, sell: 1 - buy },
      latencyMs: performance.now() - t0,
    };
  }
}

export const createModel = (): Model => (config.model === "jev" ? new JevModel() : new MockModel());

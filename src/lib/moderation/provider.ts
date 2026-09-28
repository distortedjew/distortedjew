import type { ModerationProvider, ModerationResult, ModerationCategory } from "./types";
import { RuleBasedModerationProvider } from "./rule-engine";

/**
 * Calls an external AI moderation endpoint if AI_PROVIDER/AI_API_KEY are
 * configured. The endpoint contract is intentionally generic (POST
 * { text } -> { riskScore, categories }) so any provider can be fronted by
 * a thin adapter without changing this file. When unconfigured, this class
 * is simply never constructed and the app falls back to the rule engine.
 */
class RemoteAIModerationProvider implements ModerationProvider {
  name = "remote-ai";
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  async analyzeText(text: string): Promise<ModerationResult> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/moderate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`moderation provider returned ${res.status}`);
      const data = (await res.json()) as {
        riskScore: number;
        categories: ModerationCategory[];
      };
      return {
        riskScore: data.riskScore,
        categories: data.categories ?? [],
        shouldBlock: false,
        shouldFlagForReview: false,
      };
    } catch (err) {
      console.error("[moderation] remote provider failed, falling back", err);
      return { riskScore: 0, categories: [], shouldBlock: false, shouldFlagForReview: false };
    }
  }
}

const ruleEngine = new RuleBasedModerationProvider();

function buildRemoteProvider(): ModerationProvider | null {
  const provider = process.env.AI_PROVIDER;
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_API_BASE_URL;
  if (!provider || provider === "mock" || !apiKey || !baseUrl) return null;
  return new RemoteAIModerationProvider(baseUrl, apiKey);
}

const remoteProvider = buildRemoteProvider();

/** Merges the always-on rule engine with an optional AI provider. */
export async function analyzeMessage(text: string): Promise<ModerationResult> {
  const results = await Promise.all([
    ruleEngine.analyzeText(text),
    remoteProvider ? remoteProvider.analyzeText(text) : Promise.resolve(null),
  ]);

  const [ruleResult, aiResult] = results;
  const categories = new Set(ruleResult.categories);
  let riskScore = ruleResult.riskScore;

  if (aiResult) {
    aiResult.categories.forEach((c) => categories.add(c));
    riskScore = Math.max(riskScore, aiResult.riskScore);
  }

  const { MODERATION_THRESHOLDS } = await import("./config");
  return {
    riskScore,
    categories: Array.from(categories),
    shouldBlock: riskScore >= MODERATION_THRESHOLDS.hardBlock,
    shouldFlagForReview: riskScore >= MODERATION_THRESHOLDS.flagForReview,
  };
}

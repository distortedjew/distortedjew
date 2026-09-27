import type { ModerationCategory, ModerationProvider, ModerationResult } from "./types";

// Deliberately coarse keyword lists — this is the always-on, zero-dependency
// safety net that runs even when no AI provider is configured. It is meant
// to catch the obvious/high-confidence cases; the AI provider (see
// provider.ts) layers on top for nuance when configured.
const KEYWORDS: Record<ModerationCategory, RegExp[]> = {
  threats: [/\bkill (you|u)\b/i, /\bi('?| a)m going to hurt\b/i, /\bthreat(en)?\b/i],
  sexual_content: [/\bnud(e|es)\b/i, /\bsex\s*chat\b/i, /\bcp\b/i, /\bonlyfans\b/i],
  hate: [/\bslur\b/i, /\bnazi\b/i, /\bethnic cleansing\b/i],
  harassment: [/\bkys\b/i, /\bi hope you die\b/i, /\bstalk(ing)? you\b/i],
  scam: [/\bwire transfer\b/i, /\bbtc wallet\b/i, /\bgift card codes?\b/i, /\bcrypto investment\b/i],
  spam: [/(https?:\/\/\S+){3,}/i, /\b(buy now|click here|dm me for)\b/i],
};

const HARD_BLOCK_CATEGORIES = new Set<ModerationCategory>(["sexual_content", "threats", "hate"]);

export class RuleBasedModerationProvider implements ModerationProvider {
  name = "rule-engine";

  async analyzeText(text: string): Promise<ModerationResult> {
    const categories: ModerationCategory[] = [];
    let score = 0;

    for (const [category, patterns] of Object.entries(KEYWORDS) as [
      ModerationCategory,
      RegExp[],
    ][]) {
      if (patterns.some((re) => re.test(text))) {
        categories.push(category);
        score += HARD_BLOCK_CATEGORIES.has(category) ? 0.6 : 0.35;
      }
    }

    // Repeated-character / all-caps shouting is a mild spam signal, not
    // block-worthy on its own.
    if (/(.)\1{6,}/.test(text)) score += 0.1;

    score = Math.min(1, score);

    const shouldBlock = categories.some((c) => HARD_BLOCK_CATEGORIES.has(c)) && score >= 0.6;
    const shouldFlagForReview = !shouldBlock && score >= 0.35;

    return { riskScore: score, categories, shouldBlock, shouldFlagForReview };
  }
}

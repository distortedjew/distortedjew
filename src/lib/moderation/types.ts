export type ModerationCategory =
  | "harassment"
  | "threats"
  | "sexual_content"
  | "hate"
  | "spam"
  | "scam";

export interface ModerationResult {
  riskScore: number; // 0 (safe) .. 1 (high risk)
  categories: ModerationCategory[];
  shouldBlock: boolean; // hard-block: never deliver the message
  shouldFlagForReview: boolean; // deliver, but queue for human review
}

export interface ModerationProvider {
  name: string;
  analyzeText(text: string): Promise<ModerationResult>;
}

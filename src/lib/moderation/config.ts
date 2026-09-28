/**
 * AI classification -> risk score -> rule engine -> human review.
 * These thresholds are the single source of truth for that pipeline so they
 * can be tuned without touching call sites. A score alone never bans a
 * user — it can only hard-block a single message or flag it for a human
 * moderator; permanent account action always goes through ModerationAction
 * rows created by a human (or an automated action within AUTO_ACTION_* below,
 * which are intentionally conservative).
 */
export const MODERATION_THRESHOLDS = {
  /** Message is silently dropped and never delivered to the peer. */
  hardBlock: 0.6,
  /** Message is delivered but queued for human moderator review. */
  flagForReview: 0.35,
  /**
   * A user whose rolling average risk score crosses this AND who has at
   * least AUTO_TIMEOUT_MIN_EVENTS flagged messages gets an automated,
   * short, reversible timeout — never a ban. Bans require human review.
   */
  autoTimeoutScore: 0.75,
  autoTimeoutMinEvents: 3,
  autoTimeoutMinutes: 15,
};

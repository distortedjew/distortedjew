/**
 * How long each kind of data is kept. The Privacy Policy and the account
 * screens render these numbers, and purgeExpiredData() (src/lib/retention.ts)
 * enforces them, so they can't drift apart. No imports: safe in browser code.
 */
export const RETENTION = {
  messagesDays: 30,
  /** Messages the filter flagged, and messages in reported chats/rooms. */
  flaggedDays: 180,
  analyticsDays: 180,
  sessionsDaysAfterExpiry: 30,
  notificationsDays: 90,
  inactiveGuestDays: 90,
} as const;

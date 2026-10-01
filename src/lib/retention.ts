import { prisma } from "@/lib/db/client";
import { redis } from "@/lib/redis/client";
import { anonymizeUser } from "@/lib/account/anonymize";
import { RETENTION } from "@/lib/retention-policy";

export { RETENTION };

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PurgeResult {
  messages: number;
  analyticsEvents: number;
  sessions: number;
  notifications: number;
  guestAccounts: number;
}

export async function purgeExpiredData(now = new Date()): Promise<PurgeResult> {
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const ordinaryCutoff = daysAgo(RETENTION.messagesDays);
  const flaggedCutoff = daysAgo(RETENTION.flaggedDays);

  // Conversations reported recently are kept for the longer review window.
  const reported = await prisma.report.findMany({
    where: { createdAt: { gte: flaggedCutoff } },
    select: { matchId: true, roomId: true },
  });
  const keepMatchIds = [...new Set(reported.map((r) => r.matchId).filter((id): id is string => !!id))];
  const keepRoomIds = [...new Set(reported.map((r) => r.roomId).filter((id): id is string => !!id))];

  // Ordinary messages: past the short window, not flagged, not in a reported conversation.
  const ordinary = await prisma.$executeRaw`
    DELETE FROM "Message"
    WHERE "createdAt" < ${ordinaryCutoff}
      AND COALESCE(("metadata"->'moderation'->>'flagged')::boolean, false) = false
      AND ("matchId" IS NULL OR NOT ("matchId" = ANY(${keepMatchIds}::text[])))
      AND ("roomId" IS NULL OR NOT ("roomId" = ANY(${keepRoomIds}::text[])))`;
  // Everything else, once the long window has passed.
  const old = await prisma.message.deleteMany({ where: { createdAt: { lt: flaggedCutoff } } });

  const analytics = await prisma.analyticsEvent.deleteMany({
    where: { createdAt: { lt: daysAgo(RETENTION.analyticsDays) } },
  });

  const sessionCutoff = daysAgo(RETENTION.sessionsDaysAfterExpiry);
  const sessions = await prisma.authSession.deleteMany({
    where: { OR: [{ expiresAt: { lt: sessionCutoff } }, { revokedAt: { lt: sessionCutoff } }] },
  });

  const notifications = await prisma.notification.deleteMany({
    where: { readAt: { not: null }, createdAt: { lt: daysAgo(RETENTION.notificationsDays) } },
  });

  const staleGuests = await prisma.user.findMany({
    where: { isGuest: true, status: { not: "DELETED" }, lastActiveAt: { lt: daysAgo(RETENTION.inactiveGuestDays) } },
    select: { id: true },
    take: 500,
  });
  for (const guest of staleGuests) await anonymizeUser(guest.id);

  return {
    messages: ordinary + old.count,
    analyticsEvents: analytics.count,
    sessions: sessions.count,
    notifications: notifications.count,
    guestAccounts: staleGuests.length,
  };
}

const LOCK_KEY = "retention:lock";
const RUN_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Runs the purge shortly after startup and every 6 hours. A Redis lock
 * keeps it to one run at a time if several app instances are up.
 */
export function scheduleRetention(): void {
  const run = async () => {
    const gotLock = await redis.set(LOCK_KEY, "1", "EX", 30 * 60, "NX").catch(() => null);
    if (gotLock !== "OK") return;
    try {
      const result = await purgeExpiredData();
      console.log("[retention] purged", result);
    } catch (err) {
      console.error("[retention] failed", err);
    } finally {
      await redis.del(LOCK_KEY).catch(() => undefined);
    }
  };
  setTimeout(run, 60_000).unref();
  setInterval(run, RUN_EVERY_MS).unref();
}

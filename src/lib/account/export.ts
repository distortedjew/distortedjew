import { prisma } from "@/lib/db/client";
import { RETENTION } from "@/lib/retention-policy";

/**
 * Everything stored about one account, for "Download my data". Other
 * people appear only by username; their own data (their messages, the
 * reports they filed about you) isn't included, since it's theirs.
 */
export async function buildAccountExport(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      email: true,
      emailVerified: true,
      isGuest: true,
      role: true,
      status: true,
      xp: true,
      level: true,
      streakDays: true,
      createdAt: true,
      lastActiveAt: true,
      profile: {
        select: { displayName: true, bio: true, avatarUrl: true, interests: true, languages: true, country: true, visibility: true },
      },
      settings: true,
    },
  });
  if (!user) return null;

  const [messages, connections, blocks, reportsFiled, notifications, sessions, achievements, moderationActions] =
    await Promise.all([
      prisma.message.findMany({
        where: { senderId: userId },
        orderBy: { createdAt: "asc" },
        select: { body: true, kind: true, matchId: true, roomId: true, createdAt: true },
      }),
      prisma.connection.findMany({
        where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
        select: {
          status: true,
          createdAt: true,
          requester: { select: { id: true, username: true } },
          addressee: { select: { id: true, username: true } },
        },
      }),
      prisma.block.findMany({
        where: { blockerId: userId },
        select: { createdAt: true, blocked: { select: { username: true } } },
      }),
      prisma.report.findMany({
        where: { reporterId: userId },
        select: { category: true, description: true, status: true, createdAt: true, reported: { select: { username: true } } },
      }),
      prisma.notification.findMany({
        where: { userId },
        select: { type: true, title: true, body: true, readAt: true, createdAt: true },
      }),
      prisma.authSession.findMany({
        where: { userId },
        select: { userAgent: true, createdAt: true, expiresAt: true, revokedAt: true },
      }),
      prisma.userAchievement.findMany({
        where: { userId },
        select: { unlockedAt: true, achievement: { select: { name: true } } },
      }),
      prisma.moderationAction.findMany({
        where: { targetId: userId },
        select: { type: true, reason: true, createdAt: true, expiresAt: true },
      }),
    ]);

  const { settings, ...account } = user;
  return {
    exportedAt: new Date().toISOString(),
    note: `Messages are kept for ${RETENTION.messagesDays} days (longer if flagged or reported), so older ones aren't included.`,
    account,
    settings: settings ? { ...settings, id: undefined, userId: undefined } : null,
    messagesSent: messages,
    connections: connections.map((c) => ({
      with: c.requester.id === userId ? c.addressee.username : c.requester.username,
      status: c.status,
      since: c.createdAt,
    })),
    blockedUsers: blocks.map((b) => ({ username: b.blocked.username, since: b.createdAt })),
    reportsYouFiled: reports(reportsFiled),
    moderationActionsOnYourAccount: moderationActions,
    notifications,
    loginSessions: sessions,
    achievements: achievements.map((a) => ({ name: a.achievement.name, unlockedAt: a.unlockedAt })),
  };
}

function reports(rows: Array<{ category: string; description: string | null; status: string; createdAt: Date; reported: { username: string } }>) {
  return rows.map((r) => ({
    about: r.reported.username,
    category: r.category,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

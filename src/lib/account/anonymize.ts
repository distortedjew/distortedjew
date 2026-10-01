import { nanoid } from "nanoid";
import { prisma } from "@/lib/db/client";
import { getStorageProvider } from "@/lib/storage";

/** The storage key of an uploaded avatar ("avatars/…"), from its public URL. */
export function avatarKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const at = url.lastIndexOf("avatars/");
  return at === -1 ? null : url.slice(at);
}

/**
 * Removes everything that identifies a person and closes the account.
 *
 * Used for "Delete account" and for inactive guest accounts. The user row
 * stays (renamed, status DELETED) because messages and moderation records
 * reference it; those are deleted on their normal retention schedule and no
 * longer point to anyone identifiable. Connections, notifications, login
 * records and the avatar file are deleted right away.
 */
export async function anonymizeUser(userId: string): Promise<void> {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { avatarUrl: true } });

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { username: `deleted_${nanoid(10)}`, email: null, emailVerified: null, passwordHash: null, status: "DELETED" },
    }),
    prisma.profile.updateMany({
      where: { userId },
      data: {
        displayName: null,
        avatarUrl: null,
        bio: null,
        interests: [],
        languages: [],
        country: null,
        visibility: "PRIVATE",
      },
    }),
    prisma.connection.deleteMany({ where: { OR: [{ requesterId: userId }, { addresseeId: userId }] } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.authSession.deleteMany({ where: { userId } }),
  ]);

  const key = avatarKeyFromUrl(profile?.avatarUrl);
  if (key) await getStorageProvider().delete(key).catch(() => undefined);
}

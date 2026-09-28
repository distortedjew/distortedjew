import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { xpForLevel } from "@/lib/gamification/xp";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await getCurrentUser();
  if (!session) redirect("/discover");

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    include: {
      profile: true,
      achievements: { include: { achievement: true }, orderBy: { unlockedAt: "desc" } },
      _count: {
        select: {
          connectionsSent: { where: { status: "ACCEPTED" } },
          connectionsReceived: { where: { status: "ACCEPTED" } },
        },
      },
    },
  });

  if (!user || !user.profile) redirect("/discover");

  const connectionsCount = user._count.connectionsSent + user._count.connectionsReceived;
  const currentLevelXp = xpForLevel(user.level);
  const nextLevelXp = xpForLevel(user.level + 1);
  const progress = Math.max(
    0,
    Math.min(100, ((user.xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100),
  );

  return (
    <ProfileEditor
      user={{
        username: user.username,
        isGuest: user.isGuest,
        xp: user.xp,
        level: user.level,
        streakDays: user.streakDays,
        createdAt: user.createdAt.toISOString(),
        connectionsCount,
        progressToNextLevel: progress,
        nextLevelXp,
      }}
      profile={{
        displayName: user.profile.displayName,
        avatarUrl: user.profile.avatarUrl,
        bio: user.profile.bio,
        interests: user.profile.interests,
        languages: user.profile.languages,
        country: user.profile.country,
        visibility: user.profile.visibility,
      }}
      achievements={user.achievements.map((a) => ({
        key: a.achievement.key,
        name: a.achievement.name,
        description: a.achievement.description,
        icon: a.achievement.icon,
        unlockedAt: a.unlockedAt.toISOString(),
      }))}
    />
  );
}

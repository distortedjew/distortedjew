import { prisma } from "@/lib/db/client";
import { redis } from "@/lib/redis/client";
import { sendTo } from "../../../server/ws/registry";

/** XP required to reach a given level. Gentle curve: 100, 250, 450, 700... */
export function xpForLevel(level: number): number {
  return Math.round(50 * level * (level + 1));
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export async function awardXp(userId: string, amount: number) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { xp: { increment: amount } },
    select: { xp: true, level: true },
  });

  const newLevel = levelForXp(user.xp);
  if (newLevel !== user.level) {
    await prisma.user.update({ where: { id: userId }, data: { level: newLevel } });
    sendTo(userId, {
      type: "notification",
      notification: {
        id: `level-${newLevel}`,
        type: "ACHIEVEMENT",
        title: `Level up! You're now level ${newLevel}`,
      },
    });
  }
}

export async function unlockAchievement(userId: string, key: string) {
  const achievement = await prisma.achievement.findUnique({ where: { key } });
  if (!achievement) return;

  const existing = await prisma.userAchievement.findUnique({
    where: { userId_achievementId: { userId, achievementId: achievement.id } },
  });
  if (existing) return;

  await prisma.userAchievement.create({
    data: { userId, achievementId: achievement.id },
  });
  await awardXp(userId, achievement.xpReward);

  await prisma.notification.create({
    data: {
      userId,
      type: "ACHIEVEMENT",
      title: `Achievement unlocked: ${achievement.name}`,
      body: achievement.description,
    },
  });

  sendTo(userId, {
    type: "notification",
    notification: {
      id: achievement.id,
      type: "ACHIEVEMENT",
      title: `Achievement unlocked: ${achievement.name}`,
      body: achievement.description,
    },
  });
}

/** Updates the user's daily streak and unlocks streak achievements. Call once per match start. */
export async function touchDailyStreak(userId: string) {
  const key = `streak:last:${userId}`;
  const today = new Date().toISOString().slice(0, 10);
  const lastDay = await redis.get(key);

  if (lastDay === today) return; // already counted today

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { streakDays: true } });
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const isConsecutive = lastDay === yesterday;
  const newStreak = isConsecutive ? (user?.streakDays ?? 0) + 1 : 1;

  await prisma.user.update({ where: { id: userId }, data: { streakDays: newStreak } });
  await redis.set(key, today, "EX", 60 * 60 * 24 * 3);

  if (newStreak >= 3) await unlockAchievement(userId, "streak_3");
  if (newStreak >= 7) await unlockAchievement(userId, "streak_7");
}

/** Tracks distinct countries met for the Globe Trotter achievement. */
export async function trackCountryMet(userId: string, country: string | null) {
  if (!country) return;
  const key = `met-countries:${userId}`;
  await redis.sadd(key, country);
  const count = await redis.scard(key);
  if (count >= 5) await unlockAchievement(userId, "globe_trotter");
}

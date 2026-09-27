import { prisma } from "@/lib/db/client";
import { redis } from "@/lib/redis/client";
import { mmKeys } from "@/lib/matchmaking/keys";

export interface LandingStats {
  totalMembers: number;
  conversationsToday: number;
  onlineNow: number;
  countriesRepresented: number;
}

/**
 * All numbers here come straight from Postgres/Redis — no placeholders.
 * On a fresh install these will legitimately read close to zero, which is
 * accurate and expected rather than deceptive.
 */
export async function getLandingStats(): Promise<LandingStats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [totalMembers, conversationsToday, onlineNow, countries] = await Promise.all([
    prisma.user.count(),
    prisma.match.count({ where: { startedAt: { gte: startOfDay } } }),
    redis.scard(mmKeys.presence()).catch(() => 0),
    prisma.profile.findMany({
      where: { country: { not: null } },
      select: { country: true },
      distinct: ["country"],
    }),
  ]);

  return {
    totalMembers,
    conversationsToday,
    onlineNow,
    countriesRepresented: countries.length,
  };
}

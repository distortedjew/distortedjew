import { redis } from "@/lib/redis/client";
import { mmKeys } from "./keys";

/** Call whenever a Block row is created so matchmaking never re-pairs the two users. */
export async function cacheBlockPair(blockerId: string, blockedId: string) {
  await Promise.all([
    redis.sadd(mmKeys.blocklist(blockerId), blockedId),
    redis.sadd(mmKeys.blocklist(blockedId), blockerId),
  ]);
}

export async function uncacheBlockPair(blockerId: string, blockedId: string) {
  await Promise.all([
    redis.srem(mmKeys.blocklist(blockerId), blockedId),
    redis.srem(mmKeys.blocklist(blockedId), blockerId),
  ]);
}

export async function isBlocked(userId: string, otherId: string): Promise<boolean> {
  const result = await redis.sismember(mmKeys.blocklist(userId), otherId);
  return result === 1;
}

/** Warms the Redis blocklist cache from Postgres — call on server boot. */
export async function warmBlocklistCache() {
  const { prisma } = await import("@/lib/db/client");
  const blocks = await prisma.block.findMany({
    select: { blockerId: true, blockedId: true },
  });
  if (blocks.length === 0) return;
  const pipeline = redis.pipeline();
  for (const b of blocks) {
    pipeline.sadd(mmKeys.blocklist(b.blockerId), b.blockedId);
    pipeline.sadd(mmKeys.blocklist(b.blockedId), b.blockerId);
  }
  await pipeline.exec();
}

import { redis } from "./client";

/**
 * Fixed-window rate limiter backed by Redis. Returns whether the action is
 * allowed and how many attempts remain in the current window.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
  const redisKey = `ratelimit:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }
  const ttl = await redis.ttl(redisKey);
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetInSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}

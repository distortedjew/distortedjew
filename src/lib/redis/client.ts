import Redis from "ioredis";

declare global {
  var __redis: Redis | undefined;
  var __redisSub: Redis | undefined;
}

function createClient() {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
}

/** General-purpose Redis client for reads/writes (queues, presence, rate limits, ephemeral state). */
export const redis = global.__redis ?? createClient();

/** Dedicated connection for pub/sub subscriptions — required by Redis semantics. */
export const redisSub = global.__redisSub ?? createClient();

if (process.env.NODE_ENV !== "production") {
  global.__redis = redis;
  global.__redisSub = redisSub;
}

redis.on("error", (err) => {
  console.error("[redis] connection error", err.message);
});
redisSub.on("error", (err) => {
  console.error("[redis:sub] connection error", err.message);
});

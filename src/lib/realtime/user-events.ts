import { redis } from "@/lib/redis/client";

/**
 * API routes and the WebSocket gateway run in the same process but in
 * separately bundled module graphs, so they can't share the in-memory
 * connection registry. Account-level events go through Redis instead.
 */
export const USER_EVENTS_CHANNEL = "wisp:user-events";

export type UserEvent = {
  type: "disconnect";
  userId: string;
  /** Shown to the user before their connection closes. */
  reason: string;
};

export async function publishUserEvent(event: UserEvent): Promise<void> {
  await redis.publish(USER_EVENTS_CHANNEL, JSON.stringify(event)).catch((err) => {
    console.error("[user-events] publish failed", err);
  });
}

/** Closes every live chat connection the user has, e.g. after a ban. */
export function disconnectUser(userId: string, reason: string) {
  return publishUserEvent({ type: "disconnect", userId, reason });
}

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";

/**
 * Fire-and-forget anonymized product analytics. Never stores message
 * bodies, emails, or IPs — only event names + small structured properties.
 */
export function trackEvent(
  userId: string | null,
  name: string,
  properties?: Record<string, unknown>,
) {
  prisma.analyticsEvent
    .create({
      data: { userId, name, properties: (properties ?? {}) as Prisma.InputJsonValue },
    })
    .catch((err) => console.error("[analytics] failed to record event", name, err));
}

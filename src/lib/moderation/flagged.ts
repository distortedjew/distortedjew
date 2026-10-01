import { prisma } from "@/lib/db/client";

/**
 * Messages the automated filter let through but marked for a person to
 * look at. Read with raw SQL so messages without a "reviewed" key (every
 * one written before it existed) still count as unreviewed.
 */
export async function unreviewedFlaggedMessageIds(limit = 100): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Message"
    WHERE COALESCE((metadata->'moderation'->>'flagged')::boolean, false)
      AND NOT COALESCE((metadata->'moderation'->>'reviewed')::boolean, false)
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => r.id);
}

export async function markFlaggedReviewed(messageId: string, reviewerId: string): Promise<boolean> {
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { metadata: true } });
  if (!message) return false;
  const metadata = (message.metadata ?? {}) as Record<string, unknown>;
  const moderation = (metadata.moderation ?? {}) as Record<string, unknown>;
  await prisma.message.update({
    where: { id: messageId },
    data: {
      metadata: {
        ...metadata,
        // Stays flagged, so retention still keeps it for the longer period.
        moderation: { ...moderation, reviewed: true, reviewedById: reviewerId, reviewedAt: new Date().toISOString() },
      },
    },
  });
  return true;
}

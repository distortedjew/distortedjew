import { afterEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db/client";
import { markFlaggedReviewed, unreviewedFlaggedMessageIds } from "./flagged";

const userIds: string[] = [];

afterEach(async () => {
  await prisma.message.deleteMany({ where: { senderId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  userIds.length = 0;
});

describe("flagged message queue", () => {
  it("lists flagged messages until a moderator reviews them", async () => {
    const u = await prisma.user.create({ data: { username: `flag-${nanoid(8)}`, isGuest: true } });
    userIds.push(u.id);
    const flagged = await prisma.message.create({
      data: { senderId: u.id, body: "borderline", metadata: { moderation: { riskScore: 0.4, flagged: true } } },
    });
    const clean = await prisma.message.create({
      data: { senderId: u.id, body: "fine", metadata: { moderation: { riskScore: 0, flagged: false } } },
    });
    const noMetadata = await prisma.message.create({ data: { senderId: u.id, body: "old" } });

    const before = await unreviewedFlaggedMessageIds(1000);
    expect(before).toContain(flagged.id);
    expect(before).not.toContain(clean.id);
    expect(before).not.toContain(noMetadata.id);

    expect(await markFlaggedReviewed(flagged.id, u.id)).toBe(true);
    expect(await unreviewedFlaggedMessageIds(1000)).not.toContain(flagged.id);

    // Still flagged, so retention keeps it for the longer period.
    const after = await prisma.message.findUniqueOrThrow({ where: { id: flagged.id } });
    expect(after.metadata).toMatchObject({ moderation: { flagged: true, reviewed: true, reviewedById: u.id } });

    expect(await markFlaggedReviewed("missing", u.id)).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db/client";

vi.mock("server-only", () => ({}));

const { purgeExpiredData, RETENTION } = await import("./retention");

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const userIds: string[] = [];

afterEach(async () => {
  if (!userIds.length) return;
  await prisma.message.deleteMany({ where: { senderId: { in: userIds } } });
  await prisma.report.deleteMany({ where: { reporterId: { in: userIds } } });
  await prisma.match.deleteMany({ where: { userAId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  userIds.length = 0;
});

async function user(data: { isGuest?: boolean; lastActiveAt?: Date } = {}) {
  const u = await prisma.user.create({
    data: { username: `ret-${nanoid(8)}`, isGuest: data.isGuest ?? true, lastActiveAt: data.lastActiveAt, profile: { create: { bio: "hi" } } },
  });
  userIds.push(u.id);
  return u;
}

async function match(a: string, b: string) {
  return prisma.match.create({ data: { userAId: a, userBId: b, mode: "RANDOM", channel: "TEXT" } });
}

function message(senderId: string, matchId: string, createdAt: Date, flagged = false) {
  return prisma.message.create({
    data: { senderId, matchId, body: "x", createdAt, metadata: { moderation: { riskScore: 0, flagged } } },
  });
}

describe("purgeExpiredData", () => {
  it("deletes ordinary messages after the short window but keeps flagged and reported ones longer", async () => {
    const a = await user();
    const b = await user();
    const plain = await match(a.id, b.id);
    const reported = await match(a.id, b.id);

    const fresh = await message(a.id, plain.id, ago(1));
    const expired = await message(a.id, plain.id, ago(RETENTION.messagesDays + 1));
    const flagged = await message(a.id, plain.id, ago(RETENTION.messagesDays + 1), true);
    const inReported = await message(a.id, reported.id, ago(RETENTION.messagesDays + 1));
    const veryOld = await message(a.id, plain.id, ago(RETENTION.flaggedDays + 1), true);
    await prisma.report.create({ data: { reporterId: b.id, reportedId: a.id, category: "SPAM", matchId: reported.id } });

    await purgeExpiredData();

    const left = new Set((await prisma.message.findMany({ where: { senderId: a.id } })).map((m) => m.id));
    expect(left.has(fresh.id)).toBe(true);
    expect(left.has(expired.id)).toBe(false);
    expect(left.has(flagged.id)).toBe(true);
    expect(left.has(inReported.id)).toBe(true);
    expect(left.has(veryOld.id)).toBe(false);
  });

  it("anonymizes guests inactive past the limit, and leaves active ones alone", async () => {
    const stale = await user({ lastActiveAt: ago(RETENTION.inactiveGuestDays + 1) });
    const active = await user({ lastActiveAt: ago(1) });

    await purgeExpiredData();

    const staleAfter = await prisma.user.findUnique({ where: { id: stale.id }, include: { profile: true } });
    expect(staleAfter?.status).toBe("DELETED");
    expect(staleAfter?.username).toMatch(/^deleted_/);
    expect(staleAfter?.profile?.bio).toBeNull();
    expect((await prisma.user.findUnique({ where: { id: active.id } }))?.status).toBe("ACTIVE");
  });
});

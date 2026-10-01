import { afterEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db/client";

vi.mock("server-only", () => ({}));

const { anonymizeUser } = await import("./anonymize");
const { buildAccountExport } = await import("./export");

const userIds: string[] = [];

afterEach(async () => {
  if (!userIds.length) return;
  await prisma.message.deleteMany({ where: { senderId: { in: userIds } } });
  await prisma.match.deleteMany({ where: { userAId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  userIds.length = 0;
});

async function user() {
  const u = await prisma.user.create({
    data: {
      username: `acct-${nanoid(8)}`,
      email: `${nanoid(8)}@example.com`,
      passwordHash: "hash",
      isGuest: false,
      profile: { create: { displayName: "Real Name", bio: "about me" } },
      settings: { create: {} },
    },
  });
  userIds.push(u.id);
  return u;
}

describe("account data", () => {
  it("exports what we hold about the person", async () => {
    const a = await user();
    const b = await user();
    const match = await prisma.match.create({ data: { userAId: a.id, userBId: b.id, mode: "RANDOM", channel: "TEXT" } });
    await prisma.message.create({ data: { senderId: a.id, matchId: match.id, body: "hello there" } });

    const data = await buildAccountExport(a.id);
    const json = JSON.stringify(data);
    expect(json).toContain(a.email!);
    expect(json).toContain("Real Name");
    expect(json).toContain("hello there");
    expect(json).not.toContain("hash\"");
  });

  it("deleting an account removes identifying data", async () => {
    const a = await user();
    await prisma.authSession.create({ data: { userId: a.id, tokenHash: nanoid(), expiresAt: new Date(Date.now() + 60_000) } });

    await anonymizeUser(a.id);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: a.id }, include: { profile: true } });
    expect(after.status).toBe("DELETED");
    expect(after.username).toMatch(/^deleted_/);
    expect(after.email).toBeNull();
    expect(after.passwordHash).toBeNull();
    expect(after.profile?.displayName ?? null).toBeNull();
    expect(after.profile?.bio ?? null).toBeNull();
    expect(await prisma.authSession.count({ where: { userId: a.id } })).toBe(0);
  });
});

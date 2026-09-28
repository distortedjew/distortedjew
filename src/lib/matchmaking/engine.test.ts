import { afterEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db/client";
import { redis } from "@/lib/redis/client";
import { joinQueue, leaveQueue, endMatch, getActiveMatchId } from "./engine";
import { cacheBlockPair, uncacheBlockPair } from "./blocklist";
import { mmKeys } from "./keys";
import type { MatchFilters } from "@/types/ws";

function baseFilters(overrides: Partial<MatchFilters> = {}): MatchFilters {
  return { mode: "RANDOM", channel: "TEXT", interests: [], language: null, country: null, ...overrides };
}

const createdUserIds: string[] = [];

async function makeUser(username: string) {
  const user = await prisma.user.create({
    data: { username, isGuest: true, role: "USER" },
  });
  createdUserIds.push(user.id);
  return user.id;
}

async function cleanupQueue(userId: string) {
  await leaveQueue(userId);
  await redis.del(mmKeys.activeMatch(userId));
}

afterEach(async () => {
  for (const id of createdUserIds) {
    await cleanupQueue(id);
  }
  if (createdUserIds.length) {
    await prisma.match.deleteMany({
      where: { OR: [{ userAId: { in: createdUserIds } }, { userBId: { in: createdUserIds } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  createdUserIds.length = 0;
});

describe("matchmaking engine", () => {
  it("pairs two compatible users waiting in the same channel", async () => {
    const a = await makeUser(`mm-a-${nanoid(6)}`);
    const b = await makeUser(`mm-b-${nanoid(6)}`);

    const firstResult = await joinQueue(a, baseFilters());
    expect(firstResult).toBeNull(); // nobody else waiting yet

    const secondResult = await joinQueue(b, baseFilters());
    expect(secondResult).not.toBeNull();
    expect([secondResult!.userAId, secondResult!.userBId].sort()).toEqual([a, b].sort());

    expect(await getActiveMatchId(a)).toBe(secondResult!.matchId);
    expect(await getActiveMatchId(b)).toBe(secondResult!.matchId);
  });

  it("does not pair two users who have blocked each other", async () => {
    const a = await makeUser(`mm-block-a-${nanoid(6)}`);
    const b = await makeUser(`mm-block-b-${nanoid(6)}`);
    await cacheBlockPair(a, b);

    try {
      await joinQueue(a, baseFilters());
      const result = await joinQueue(b, baseFilters());
      expect(result).toBeNull();
      expect(await getActiveMatchId(a)).toBeNull();
      expect(await getActiveMatchId(b)).toBeNull();
    } finally {
      await uncacheBlockPair(a, b);
    }
  });

  it("does not immediately re-pair users who just ended a match", async () => {
    const a = await makeUser(`mm-recent-a-${nanoid(6)}`);
    const b = await makeUser(`mm-recent-b-${nanoid(6)}`);

    await joinQueue(a, baseFilters());
    const match = await joinQueue(b, baseFilters());
    expect(match).not.toBeNull();

    await endMatch(match!.matchId, a, "NEXT");

    await joinQueue(a, baseFilters());
    const rematch = await joinQueue(b, baseFilters());
    expect(rematch).toBeNull(); // cooldown should prevent an immediate rematch
  });

  it("only pairs users who share the requested interest in INTERESTS mode", async () => {
    const a = await makeUser(`mm-int-a-${nanoid(6)}`);
    const b = await makeUser(`mm-int-b-${nanoid(6)}`);

    await joinQueue(a, baseFilters({ mode: "INTERESTS", interests: ["Music"] }));
    const noMatch = await joinQueue(b, baseFilters({ mode: "INTERESTS", interests: ["Sports"] }));
    expect(noMatch).toBeNull();

    await leaveQueue(a);
    await leaveQueue(b);

    await joinQueue(a, baseFilters({ mode: "INTERESTS", interests: ["Music", "Gaming"] }));
    const match = await joinQueue(b, baseFilters({ mode: "INTERESTS", interests: ["Gaming"] }));
    expect(match).not.toBeNull();
    expect(match!.sharedInterests).toContain("Gaming");
  });

  it("leaveQueue removes the user so they are not matched later", async () => {
    const a = await makeUser(`mm-leave-a-${nanoid(6)}`);
    const b = await makeUser(`mm-leave-b-${nanoid(6)}`);

    await joinQueue(a, baseFilters());
    await leaveQueue(a);

    const result = await joinQueue(b, baseFilters());
    expect(result).toBeNull();
  });
});

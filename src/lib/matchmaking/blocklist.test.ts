import { afterEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { redis } from "@/lib/redis/client";
import { cacheBlockPair, uncacheBlockPair, isBlocked } from "./blocklist";
import { mmKeys } from "./keys";

const cleanupIds: string[] = [];

afterEach(async () => {
  if (cleanupIds.length) {
    await redis.del(...cleanupIds.map((id) => mmKeys.blocklist(id)));
    cleanupIds.length = 0;
  }
});

function userId() {
  const id = `test-user-${nanoid()}`;
  cleanupIds.push(id);
  return id;
}

describe("matchmaking blocklist cache", () => {
  it("is symmetric: blocking A->B also prevents B from matching A", async () => {
    const a = userId();
    const b = userId();
    await cacheBlockPair(a, b);

    expect(await isBlocked(a, b)).toBe(true);
    expect(await isBlocked(b, a)).toBe(true);
  });

  it("does not report unrelated users as blocked", async () => {
    const a = userId();
    const b = userId();
    const c = userId();
    await cacheBlockPair(a, b);

    expect(await isBlocked(a, c)).toBe(false);
    expect(await isBlocked(c, a)).toBe(false);
  });

  it("removes the block symmetrically on uncache", async () => {
    const a = userId();
    const b = userId();
    await cacheBlockPair(a, b);
    await uncacheBlockPair(a, b);

    expect(await isBlocked(a, b)).toBe(false);
    expect(await isBlocked(b, a)).toBe(false);
  });
});

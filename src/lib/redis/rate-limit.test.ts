import { afterEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { redis } from "./client";
import { rateLimit } from "./rate-limit";

const keysToClean: string[] = [];

afterEach(async () => {
  if (keysToClean.length) {
    await redis.del(...keysToClean);
    keysToClean.length = 0;
  }
});

function testKey() {
  const key = `test:${nanoid()}`;
  keysToClean.push(`ratelimit:${key}`);
  return key;
}

describe("rateLimit (Redis-backed)", () => {
  it("allows requests up to the limit and blocks the next one", async () => {
    const key = testKey();
    const results = [];
    for (let i = 0; i < 3; i++) {
      results.push(await rateLimit(key, 3, 60));
    }
    expect(results.every((r) => r.allowed)).toBe(true);

    const fourth = await rateLimit(key, 3, 60);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("tracks remaining count accurately", async () => {
    const key = testKey();
    const first = await rateLimit(key, 5, 60);
    expect(first.remaining).toBe(4);
    const second = await rateLimit(key, 5, 60);
    expect(second.remaining).toBe(3);
  });

  it("isolates limits per key", async () => {
    const keyA = testKey();
    const keyB = testKey();
    await rateLimit(keyA, 1, 60);
    const blockedA = await rateLimit(keyA, 1, 60);
    const allowedB = await rateLimit(keyB, 1, 60);
    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });

  it("resets after the window expires", async () => {
    const key = testKey();
    await rateLimit(key, 1, 1);
    const blocked = await rateLimit(key, 1, 1);
    expect(blocked.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const afterReset = await rateLimit(key, 1, 1);
    expect(afterReset.allowed).toBe(true);
  });
});

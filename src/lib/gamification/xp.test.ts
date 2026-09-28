import { describe, expect, it } from "vitest";
import { xpForLevel, levelForXp } from "./xp";

describe("xp/level curve", () => {
  it("requires more xp for each subsequent level (monotonically increasing)", () => {
    for (let level = 1; level < 20; level++) {
      expect(xpForLevel(level + 1)).toBeGreaterThan(xpForLevel(level));
    }
  });

  it("starts new users at level 1 with zero xp", () => {
    expect(levelForXp(0)).toBe(1);
  });

  it("levelForXp is the inverse of xpForLevel at exact thresholds", () => {
    for (let level = 1; level < 15; level++) {
      const xpNeeded = xpForLevel(level + 1);
      expect(levelForXp(xpNeeded)).toBeGreaterThanOrEqual(level + 1);
      expect(levelForXp(xpNeeded - 1)).toBeLessThan(level + 1);
    }
  });

  it("never regresses level for more xp", () => {
    let previousLevel = levelForXp(0);
    for (let xp = 0; xp <= 5000; xp += 137) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(previousLevel);
      previousLevel = level;
    }
  });
});

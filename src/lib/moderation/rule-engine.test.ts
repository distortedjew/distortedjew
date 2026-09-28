import { describe, expect, it } from "vitest";
import { RuleBasedModerationProvider } from "./rule-engine";

const engine = new RuleBasedModerationProvider();

describe("rule-based moderation provider", () => {
  it("passes ordinary conversational text", async () => {
    const result = await engine.analyzeText("Hey! Where are you from? I love hiking too.");
    expect(result.shouldBlock).toBe(false);
    expect(result.shouldFlagForReview).toBe(false);
    expect(result.categories).toHaveLength(0);
  });

  it("hard-blocks threats", async () => {
    const result = await engine.analyzeText("I'm going to hurt you if you don't stop");
    expect(result.categories).toContain("threats");
    expect(result.shouldBlock).toBe(true);
  });

  it("hard-blocks sexual content solicitation", async () => {
    const result = await engine.analyzeText("check out my onlyfans for nudes");
    expect(result.categories).toContain("sexual_content");
    expect(result.shouldBlock).toBe(true);
  });

  it("flags scam patterns for review without hard-blocking", async () => {
    const result = await engine.analyzeText("send me a wire transfer to my btc wallet now");
    expect(result.categories).toEqual(expect.arrayContaining(["scam"]));
    expect(result.shouldBlock).toBe(false);
    expect(result.shouldFlagForReview).toBe(true);
  });

  it("flags spam link-dumping", async () => {
    const result = await engine.analyzeText(
      "http://a.com http://b.com http://c.com click here",
    );
    expect(result.categories).toContain("spam");
    expect(result.riskScore).toBeGreaterThan(0);
  });

  it("caps the risk score at 1", async () => {
    const result = await engine.analyzeText(
      "kill you nudes onlyfans slur nazi kys wire transfer btc wallet",
    );
    expect(result.riskScore).toBeLessThanOrEqual(1);
  });

  it("is case-insensitive", async () => {
    const result = await engine.analyzeText("I HOPE YOU DIE");
    expect(result.categories).toContain("harassment");
  });
});

import { describe, expect, it } from "vitest";
import {
  clientMessageKind,
  isAllowedReaction,
  safeHttpUrl,
  sanitizeMatchFilters,
  sanitizeMessageMetadata,
} from "./sanitize";

describe("chat input sanitizing", () => {
  it("only allows the offered reactions, so free text can't skip moderation", () => {
    expect(isAllowedReaction("🔥")).toBe(true);
    expect(isAllowedReaction("you are awful")).toBe(false);
    expect(isAllowedReaction({})).toBe(false);
  });

  it("clients can't send server-only message kinds", () => {
    expect(clientMessageKind("MUSIC_SHARE")).toBe("MUSIC_SHARE");
    expect(clientMessageKind("SYSTEM")).toBe("TEXT");
    expect(clientMessageKind(undefined)).toBe("TEXT");
  });

  it("rebuilds music metadata from known fields and drops everything else", () => {
    const meta = sanitizeMessageMetadata("MUSIC_SHARE", {
      title: "  Blue Monday ",
      artist: "New Order",
      url: "https://open.spotify.com/track/x",
      moderation: { riskScore: 0 },
      junk: "x".repeat(10_000),
    });
    expect(meta).toEqual({ title: "Blue Monday", artist: "New Order", url: "https://open.spotify.com/track/x" });
    expect(sanitizeMessageMetadata("TEXT", { title: "a", artist: "b" })).toBeUndefined();
    expect(sanitizeMessageMetadata("MUSIC_SHARE", { title: "a" })).toBeUndefined();
  });

  it("only keeps http(s) links", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("data:text/html,hi")).toBeUndefined();
    expect(safeHttpUrl("not a url")).toBeUndefined();
    expect(safeHttpUrl("https://music.apple.com/x")).toBe("https://music.apple.com/x");
  });

  it("keeps only known match filter values", () => {
    expect(
      sanitizeMatchFilters({
        mode: "HACK",
        channel: "SMOKE",
        interests: ["Music", "Music", "x".repeat(5000), 42],
        language: "en; DROP",
        country: "PT",
      }),
    ).toEqual({ mode: "RANDOM", channel: "TEXT", interests: ["Music"], language: null, country: "PT" });
    expect(sanitizeMatchFilters(null).mode).toBe("RANDOM");
  });
});

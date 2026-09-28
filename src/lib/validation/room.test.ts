import { describe, expect, it } from "vitest";
import { createRoomSchema } from "./room";

describe("createRoomSchema", () => {
  it("accepts a minimal valid room with defaults applied", () => {
    const result = createRoomSchema.safeParse({ title: "Late night chat" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.channel).toBe("TEXT");
      expect(result.data.maxParticipants).toBe(8);
      expect(result.data.isPrivate).toBe(false);
    }
  });

  it("rejects a title shorter than 3 characters", () => {
    expect(createRoomSchema.safeParse({ title: "hi" }).success).toBe(false);
  });

  it("rejects more than 8 participants", () => {
    const result = createRoomSchema.safeParse({ title: "Game night", maxParticipants: 20 });
    expect(result.success).toBe(false);
  });

  it("rejects fewer than 2 participants", () => {
    const result = createRoomSchema.safeParse({ title: "Solo room", maxParticipants: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects more than 6 interests", () => {
    const interests = Array.from({ length: 7 }, (_, i) => `interest-${i}`);
    const result = createRoomSchema.safeParse({ title: "Big interests", interests });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid channel", () => {
    const result = createRoomSchema.safeParse({ title: "Bad channel", channel: "TELEPATHY" });
    expect(result.success).toBe(false);
  });
});

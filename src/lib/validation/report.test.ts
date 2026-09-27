import { describe, expect, it } from "vitest";
import { createReportSchema } from "./report";

describe("createReportSchema", () => {
  it("accepts a minimal valid report", () => {
    const result = createReportSchema.safeParse({ reportedId: "user_1", category: "SPAM" });
    expect(result.success).toBe(true);
  });

  it("accepts an optional description, matchId, and roomId", () => {
    const result = createReportSchema.safeParse({
      reportedId: "user_1",
      category: "HARASSMENT",
      description: "Kept sending unwanted messages after I asked them to stop.",
      matchId: "match_1",
      roomId: "room_1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown category", () => {
    const result = createReportSchema.safeParse({ reportedId: "user_1", category: "NOT_A_CATEGORY" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing reportedId", () => {
    const result = createReportSchema.safeParse({ category: "SPAM" });
    expect(result.success).toBe(false);
  });

  it("rejects an overly long description", () => {
    const result = createReportSchema.safeParse({
      reportedId: "user_1",
      category: "OTHER",
      description: "x".repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

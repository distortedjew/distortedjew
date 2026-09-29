import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it.each(["/admin", "/rooms/abc?x=1", "/settings#danger"])("keeps same-site path %s", (p) => {
    expect(safeRedirectPath(p)).toBe(p);
  });

  it.each([
    "https://evil.example",
    "//evil.example/login",
    "/\\evil.example",
    "javascript:alert(1)",
    "evil.example",
    "/\t/evil.example",
    "",
    null,
    undefined,
  ])("falls back for %s", (p) => {
    expect(safeRedirectPath(p as string | null | undefined)).toBe("/discover");
  });
});

import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken, type SessionClaims } from "./jwt";

const claims: SessionClaims = {
  sub: "user_123",
  username: "wanderlust_22",
  role: "USER",
  isGuest: false,
};

describe("session JWT", () => {
  it("round-trips valid claims through sign and verify", async () => {
    const token = await signSessionToken(claims);
    const result = await verifySessionToken(token);
    expect(result).toEqual(claims);
  });

  it("rejects a tampered token", async () => {
    const token = await signSessionToken(claims);
    const tampered = token.slice(0, -4) + "abcd";
    await expect(verifySessionToken(tampered)).resolves.toBeNull();
  });

  it("rejects garbage input", async () => {
    await expect(verifySessionToken("not.a.jwt")).resolves.toBeNull();
    await expect(verifySessionToken("")).resolves.toBeNull();
  });

  it("preserves role and guest status across the round trip", async () => {
    const adminToken = await signSessionToken({ ...claims, role: "ADMIN", isGuest: true });
    const result = await verifySessionToken(adminToken);
    expect(result?.role).toBe("ADMIN");
    expect(result?.isGuest).toBe(true);
  });
});

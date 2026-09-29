import { describe, expect, it } from "vitest";
import { authSecretProblem, signSessionToken, verifySessionToken, type SessionClaims } from "./jwt";

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

describe("authSecretProblem", () => {
  it("accepts a generated secret", () => {
    expect(authSecretProblem("G3Z041gBw4bKHmIgOhTtTH/VGzkUWeuLzURoWR9Sg0M=")).toBeNull();
  });

  it.each([
    [undefined, /not set/],
    ["", /not set/],
    ["short-secret", /at least 32/],
    ["replace-with-a-random-32-byte-base64-secret", /example value/],
    ["changeme-changeme-changeme-changeme-12", /example value/],
  ])("rejects %s", (secret, message) => {
    expect(authSecretProblem(secret as string | undefined)).toMatch(message);
  });
});

describe("signSessionToken uniqueness", () => {
  it("issues a different token for each login, even within the same second", async () => {
    const claims: SessionClaims = { sub: "u1", username: "a", role: "USER", isGuest: false };
    const [a, b] = await Promise.all([signSessionToken(claims), signSessionToken(claims)]);
    expect(a).not.toBe(b);
  });
});

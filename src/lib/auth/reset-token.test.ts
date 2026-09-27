import { describe, expect, it } from "vitest";
import { signResetToken, decodeResetToken, matchesCurrentPassword, verifyResetToken } from "./reset-token";

const USER_ID = "user_abc123";
const OLD_HASH = "$2a$12$oldhashvalueoldhashvalueoldhash";
const NEW_HASH = "$2a$12$newhashvaluenewhashvaluenewhash";

describe("password reset tokens", () => {
  it("round-trips: decodes the user id it was signed for", async () => {
    const token = await signResetToken(USER_ID, OLD_HASH);
    const decoded = await decodeResetToken(token);
    expect(decoded?.userId).toBe(USER_ID);
  });

  it("matches the fingerprint against the same passwordHash it was signed with", async () => {
    const token = await signResetToken(USER_ID, OLD_HASH);
    const decoded = await decodeResetToken(token);
    expect(decoded && matchesCurrentPassword(decoded, OLD_HASH)).toBe(true);
  });

  it("self-invalidates once the password has changed (fingerprint mismatch)", async () => {
    const token = await signResetToken(USER_ID, OLD_HASH);
    const decoded = await decodeResetToken(token);
    expect(decoded && matchesCurrentPassword(decoded, NEW_HASH)).toBe(false);
  });

  it("verifyResetToken succeeds only against the original password hash", async () => {
    const token = await signResetToken(USER_ID, OLD_HASH);
    await expect(verifyResetToken(token, OLD_HASH)).resolves.toEqual({ userId: USER_ID });
    await expect(verifyResetToken(token, NEW_HASH)).resolves.toBeNull();
  });

  it("rejects a tampered token", async () => {
    const token = await signResetToken(USER_ID, OLD_HASH);
    const tampered = token.slice(0, -4) + "abcd";
    expect(await decodeResetToken(tampered)).toBeNull();
  });

  it("rejects garbage input", async () => {
    expect(await decodeResetToken("not-a-jwt")).toBeNull();
    expect(await decodeResetToken("")).toBeNull();
  });

  it("is not interchangeable with a session token (different purpose/shape)", async () => {
    // A session JWT has no `purpose: "password_reset"` claim, so even a
    // validly-signed session token must not decode as a reset token.
    const { signSessionToken } = await import("./jwt");
    const sessionToken = await signSessionToken({
      sub: USER_ID,
      username: "someone",
      role: "USER",
      isGuest: false,
    });
    expect(await decodeResetToken(sessionToken)).toBeNull();
  });
});

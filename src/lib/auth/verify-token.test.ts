import { describe, expect, it } from "vitest";
import { signVerifyToken, decodeVerifyToken } from "./verify-token";

const USER_ID = "user_abc123";
const EMAIL = "someone@example.com";

describe("email verification tokens", () => {
  it("round-trips: decodes the user id and email it was signed for", async () => {
    const token = await signVerifyToken(USER_ID, EMAIL);
    const decoded = await decodeVerifyToken(token);
    expect(decoded).toEqual({ userId: USER_ID, email: EMAIL });
  });

  it("rejects a tampered token", async () => {
    const token = await signVerifyToken(USER_ID, EMAIL);
    const tampered = token.slice(0, -4) + "abcd";
    expect(await decodeVerifyToken(tampered)).toBeNull();
  });

  it("rejects garbage input", async () => {
    expect(await decodeVerifyToken("not-a-jwt")).toBeNull();
    expect(await decodeVerifyToken("")).toBeNull();
  });

  it("is not interchangeable with a session token or a password-reset token", async () => {
    const { signSessionToken } = await import("./jwt");
    const { signResetToken } = await import("./reset-token");

    const sessionToken = await signSessionToken({
      sub: USER_ID,
      username: "someone",
      role: "USER",
      isGuest: false,
    });
    const resetToken = await signResetToken(USER_ID, "$2a$12$somehash");

    expect(await decodeVerifyToken(sessionToken)).toBeNull();
    expect(await decodeVerifyToken(resetToken)).toBeNull();
  });
});

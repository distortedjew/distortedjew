import { SignJWT, jwtVerify } from "jose";
import { createHash } from "node:crypto";
import { getSecretKey } from "./jwt";

const RESET_TOKEN_TTL_MINUTES = 30;

export interface DecodedResetToken {
  userId: string;
  fingerprint: string;
}

/**
 * A password-reset token is a short-lived, self-invalidating JWT rather than
 * a database row: it embeds a fingerprint of the user's *current*
 * passwordHash, so once the password actually changes (via this token or
 * any other route) the fingerprint no longer matches and the token stops
 * verifying — no separate "used tokens" table or cleanup job needed.
 */
function fingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

export async function signResetToken(userId: string, currentPasswordHash: string): Promise<string> {
  return new SignJWT({ purpose: "password_reset", fp: fingerprint(currentPasswordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${RESET_TOKEN_TTL_MINUTES}m`)
    .sign(getSecretKey());
}

/**
 * Verifies the token's signature, expiry, and purpose (but not yet whether
 * it's been spent) and returns the user id it was issued for plus its
 * embedded fingerprint. Callers look that user up and compare the
 * fingerprint against their current passwordHash separately, since that
 * requires a DB read this function doesn't do.
 */
export async function decodeResetToken(token: string): Promise<DecodedResetToken | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      payload.purpose !== "password_reset" ||
      typeof payload.sub !== "string" ||
      typeof payload.fp !== "string"
    ) {
      return null;
    }
    return { userId: payload.sub, fingerprint: payload.fp };
  } catch {
    return null;
  }
}

export function matchesCurrentPassword(decoded: DecodedResetToken, currentPasswordHash: string): boolean {
  return decoded.fingerprint === fingerprint(currentPasswordHash);
}

export async function verifyResetToken(
  token: string,
  currentPasswordHash: string,
): Promise<{ userId: string } | null> {
  const decoded = await decodeResetToken(token);
  if (!decoded || !matchesCurrentPassword(decoded, currentPasswordHash)) return null;
  return { userId: decoded.userId };
}

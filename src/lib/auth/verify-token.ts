import { SignJWT, jwtVerify } from "jose";
import { getSecretKey } from "./jwt";

const VERIFY_TOKEN_TTL_HOURS = 24;

export interface DecodedVerifyToken {
  userId: string;
  email: string;
}

/**
 * Email verification is non-blocking (registering signs you in immediately,
 * same as today) — this just marks `emailVerified` once confirmed. The
 * token embeds the target email so an old link can't confirm a different
 * email the account may have moved to later.
 */
export async function signVerifyToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ purpose: "verify_email", email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${VERIFY_TOKEN_TTL_HOURS}h`)
    .sign(getSecretKey());
}

export async function decodeVerifyToken(token: string): Promise<DecodedVerifyToken | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      payload.purpose !== "verify_email" ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string"
    ) {
      return null;
    }
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

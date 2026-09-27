import { SignJWT, jwtVerify } from "jose";

export interface SessionClaims {
  sub: string; // user id
  username: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  isGuest: boolean;
}

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

const SESSION_TTL_DAYS = Number(process.env.AUTH_SESSION_TTL_DAYS ?? 30);

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.sub === "string" &&
      typeof payload.username === "string" &&
      typeof payload.role === "string" &&
      typeof payload.isGuest === "boolean"
    ) {
      return {
        sub: payload.sub,
        username: payload.username,
        role: payload.role as SessionClaims["role"],
        isGuest: payload.isGuest,
      };
    }
    return null;
  } catch {
    return null;
  }
}

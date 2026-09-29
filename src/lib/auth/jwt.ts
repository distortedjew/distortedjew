import { SignJWT, jwtVerify } from "jose";

export interface SessionClaims {
  sub: string; // user id
  username: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  isGuest: boolean;
}

const MIN_SECRET_LENGTH = 32;
// Fragments of example values (e.g. .env.example's "replace-with-a-random-…").
const PLACEHOLDER_FRAGMENTS = ["replace-with", "changeme", "change-me", "change_me"];

/**
 * Why AUTH_SECRET is unusable, or null if it's fine. Anyone who knows or
 * guesses the secret can sign their own session, so a short or example
 * value would let them log in as anyone (including an admin).
 */
export function authSecretProblem(secret: string | undefined): string | null {
  if (!secret) return "AUTH_SECRET is not set.";
  if (secret.length < MIN_SECRET_LENGTH) return `AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`;
  const lower = secret.toLowerCase();
  if (PLACEHOLDER_FRAGMENTS.some((fragment) => lower.includes(fragment))) {
    return "AUTH_SECRET is still the example value.";
  }
  return null;
}

export function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  const problem = authSecretProblem(secret);
  if (problem) {
    throw new Error(`${problem} Generate one with: openssl rand -base64 32`);
  }
  return new TextEncoder().encode(secret);
}

const SESSION_TTL_DAYS = Number(process.env.AUTH_SESSION_TTL_DAYS ?? 30);

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    // A random ID makes every token unique. Without it, two logins by the
    // same user in the same second produced identical tokens, and the
    // second failed on the unique session row.
    .setJti(globalThis.crypto.randomUUID())
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

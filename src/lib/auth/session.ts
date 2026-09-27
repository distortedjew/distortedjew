import "server-only";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { signSessionToken, verifySessionToken, type SessionClaims } from "./jwt";

export const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "wisp_session";
const SESSION_TTL_DAYS = Number(process.env.AUTH_SESSION_TTL_DAYS ?? 30);

export type CurrentUser = SessionClaims;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a new signed session for a user, persists a revocable AuthSession
 * row (device tracking / "sign out everywhere"), and sets the httpOnly cookie.
 */
export async function createSessionForUser(user: {
  id: string;
  username: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  isGuest: boolean;
}, meta?: { userAgent?: string | null; ipHash?: string | null }) {
  const token = await signSessionToken({
    sub: user.id,
    username: user.username,
    role: user.role,
    isGuest: user.isGuest,
  });

  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      userAgent: meta?.userAgent ?? null,
      ipHash: meta?.ipHash ?? null,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (token) {
    await prisma.authSession
      .updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  cookieStore.delete(AUTH_COOKIE_NAME);
}

/** Reads and verifies the current request's session cookie (server components / route handlers). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const claims = await verifySessionToken(token);
  return claims;
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return user;
}

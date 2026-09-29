import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { verifySessionToken, type SessionClaims } from "./jwt";

export interface ResolvedSession extends SessionClaims {
  /** True while a moderator timeout is running: the user can browse but not chat. */
  timedOut: boolean;
  /** When the timeout ends, if it has an end. */
  timedOutUntil: Date | null;
}

/** Account states that remove all access, whatever the token says. */
const LOCKED_STATUSES = new Set(["BANNED", "SUSPENDED", "DELETED"]);

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Turns a session cookie into the current user, or null.
 *
 * The JWT signature alone isn't enough: logging out, resetting a password,
 * deleting an account, banning and demoting are all recorded in the
 * database, and a still-valid token must stop working the moment they
 * happen. So every request also checks the AuthSession row (not revoked,
 * not expired) and takes role and status from the user row, never from the
 * token's claims.
 */
export async function resolveSession(token: string): Promise<ResolvedSession | null> {
  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const row = await prisma.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      userId: true,
      revokedAt: true,
      expiresAt: true,
      user: { select: { id: true, username: true, role: true, status: true, isGuest: true, statusUntil: true } },
    },
  });

  const now = new Date();
  if (!row || row.revokedAt || row.expiresAt <= now || row.userId !== claims.sub) return null;

  const user = row.user;
  if (LOCKED_STATUSES.has(user.status)) return null;

  const timedOut = user.status === "TIMEOUT" && (!user.statusUntil || user.statusUntil > now);

  return {
    sub: user.id,
    username: user.username,
    role: user.role,
    isGuest: user.isGuest,
    timedOut,
    timedOutUntil: timedOut ? user.statusUntil : null,
  };
}

import type { IncomingMessage } from "node:http";
import { resolveSession } from "@/lib/auth/resolve-session";
import type { ConnectionMeta } from "./registry";

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "wisp_session";

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export async function authenticateUpgrade(
  req: IncomingMessage,
): Promise<ConnectionMeta | null> {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[AUTH_COOKIE_NAME];
  if (!token) return null;

  // Same check as HTTP requests: a revoked session or a banned/suspended
  // account can't connect. Timed-out accounts can browse but not chat.
  const session = await resolveSession(token);
  if (!session || session.timedOut) return null;

  return {
    userId: session.sub,
    username: session.username,
    isGuest: session.isGuest,
    role: session.role,
  };
}

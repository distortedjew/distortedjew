import type { IncomingMessage } from "node:http";
import { verifySessionToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db/client";
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

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, username: true, isGuest: true, role: true, status: true },
  });
  if (!user || user.status === "BANNED" || user.status === "SUSPENDED") {
    return null;
  }

  return {
    userId: user.id,
    username: user.username,
    isGuest: user.isGuest,
    role: user.role,
  };
}

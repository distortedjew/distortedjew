import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * Returns a salted, one-way hash of the requester's IP address. We never
 * persist raw IP addresses (privacy requirement) — only a hash suitable for
 * abuse-rate-limiting and correlation, never reversible to the source IP.
 */
export async function getClientIpHash(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : (h.get("x-real-ip") ?? "unknown");
  const salt = process.env.AUTH_SECRET ?? "dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function getUserAgent(): Promise<string | null> {
  const h = await headers();
  return h.get("user-agent");
}

import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";

/**
 * Is this peer address a reverse proxy we can believe? Only loopback and
 * private-network peers qualify: a proxy on the same machine (nginx,
 * Caddy) or on the same Docker network. A peer on a public address is the
 * client itself, and anything it puts in X-Forwarded-For is made up.
 */
export function isTrustedProxyAddress(address: string | undefined): boolean {
  if (!address) return false;
  const ip = address.startsWith("::ffff:") ? address.slice(7) : address;

  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  }
  return false;
}

/**
 * Rewrites the forwarding headers so the rest of the app can trust them.
 *
 * Per-IP rate limits (login, sign-up, password reset) read X-Forwarded-For.
 * Without this, anyone reaching the app directly could send a different
 * made-up IP on every request and never hit a limit.
 *
 * - From a trusted proxy: keep the address that proxy appended (the
 *   rightmost X-Forwarded-For entry; earlier entries came from the client),
 *   and keep X-Forwarded-Proto.
 * - From anyone else: use the socket's own address and drop the
 *   client-supplied forwarding headers.
 */
export function normalizeForwardedHeaders(req: IncomingMessage): void {
  const peer = req.socket.remoteAddress ?? "";
  let clientIp = peer;

  if (isTrustedProxyAddress(peer)) {
    const forwarded = String(req.headers["x-forwarded-for"] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const realIp = req.headers["x-real-ip"];
    if (forwarded.length > 0) clientIp = forwarded[forwarded.length - 1];
    else if (typeof realIp === "string" && realIp) clientIp = realIp;
  } else {
    delete req.headers["x-forwarded-proto"];
    delete req.headers["x-forwarded-host"];
  }

  req.headers["x-forwarded-for"] = clientIp;
  delete req.headers["x-real-ip"];
}

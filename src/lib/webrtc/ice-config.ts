import { createHmac } from "node:crypto";
import type { RTCIceServerConfig } from "@/types/ws";

/** How long a TURN login handed to a client stays usable. */
export const TURN_CREDENTIAL_TTL_SECONDS = 12 * 60 * 60;

/**
 * Time-limited TURN login in coturn's "use-auth-secret" format: the
 * username is "<expiry unix time>:<user id>" and the password is an HMAC of
 * it with a secret only the app and coturn know. Each user gets their own
 * login that stops working after the TTL, so a leaked one can't turn the
 * relay into a free, permanent proxy.
 */
export function ephemeralTurnCredential(secret: string, userId: string, now = Date.now()) {
  const username = `${Math.floor(now / 1000) + TURN_CREDENTIAL_TTL_SECONDS}:${userId}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential };
}

/**
 * Builds the ICE server list for one user. STUN servers are public. TURN is
 * only included if configured: with TURN_SECRET, each user gets their own
 * short-lived login; TURN_USERNAME/TURN_PASSWORD (a single static login) is
 * the fallback for hosted TURN services that don't support that.
 */
export function getIceServers(userId?: string): RTCIceServerConfig[] {
  const servers: RTCIceServerConfig[] = [];

  const stun = (process.env.STUN_SERVERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (stun.length > 0) {
    servers.push({ urls: stun });
  }

  const turnServer = process.env.TURN_SERVER;
  const turnSecret = process.env.TURN_SECRET;
  const turnUsername = process.env.TURN_USERNAME;
  const turnPassword = process.env.TURN_PASSWORD;
  if (turnServer && turnSecret && userId) {
    servers.push({
      urls: turnServer.split(",").map((s) => s.trim()),
      ...ephemeralTurnCredential(turnSecret, userId),
    });
  } else if (turnServer && !turnSecret && turnUsername && turnPassword) {
    servers.push({
      urls: turnServer.split(",").map((s) => s.trim()),
      username: turnUsername,
      credential: turnPassword,
    });
  }

  if (servers.length === 0) {
    // Safe fallback so local dev still works without any env configuration.
    servers.push({ urls: ["stun:stun.l.google.com:19302"] });
  }

  return servers;
}

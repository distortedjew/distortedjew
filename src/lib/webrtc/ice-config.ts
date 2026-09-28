import type { RTCIceServerConfig } from "@/types/ws";

/**
 * Builds the ICE server list from environment configuration. STUN servers
 * are always public/safe to hand to the client. TURN credentials are only
 * included if configured — never hardcoded, never logged.
 */
export function getIceServers(): RTCIceServerConfig[] {
  const servers: RTCIceServerConfig[] = [];

  const stun = (process.env.STUN_SERVERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (stun.length > 0) {
    servers.push({ urls: stun });
  }

  const turnServer = process.env.TURN_SERVER;
  const turnUsername = process.env.TURN_USERNAME;
  const turnPassword = process.env.TURN_PASSWORD;
  if (turnServer && turnUsername && turnPassword) {
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

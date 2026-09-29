import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { getIceServers, TURN_CREDENTIAL_TTL_SECONDS } from "./ice-config";

const ENV_KEYS = ["STUN_SERVERS", "TURN_SERVER", "TURN_USERNAME", "TURN_PASSWORD", "TURN_SECRET"] as const;
const originalEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) originalEnv[key] = process.env[key];

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.unstubAllEnvs();
});

describe("getIceServers", () => {
  it("falls back to a public STUN server when nothing is configured", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const servers = getIceServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].urls).toContain("stun:stun.l.google.com:19302");
    expect(servers[0].username).toBeUndefined();
  });

  it("uses configured STUN servers, comma-split and trimmed", () => {
    process.env.STUN_SERVERS = "stun:a.example.com:3478, stun:b.example.com:3478";
    delete process.env.TURN_SERVER;
    const servers = getIceServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].urls).toEqual(["stun:a.example.com:3478", "stun:b.example.com:3478"]);
  });

  it("adds a TURN server entry only when server, username, and password are all set", () => {
    process.env.STUN_SERVERS = "stun:a.example.com:3478";
    process.env.TURN_SERVER = "turn:relay.example.com:3478";
    process.env.TURN_USERNAME = "wisp";
    process.env.TURN_PASSWORD = "secret";
    const servers = getIceServers();
    expect(servers).toHaveLength(2);
    const turn = servers.find((s) => s.username);
    expect(turn?.urls).toEqual(["turn:relay.example.com:3478"]);
    expect(turn?.credential).toBe("secret");
  });

  it("omits TURN when credentials are incomplete", () => {
    process.env.STUN_SERVERS = "stun:a.example.com:3478";
    process.env.TURN_SERVER = "turn:relay.example.com:3478";
    process.env.TURN_USERNAME = "wisp";
    delete process.env.TURN_PASSWORD;
    const servers = getIceServers();
    expect(servers).toHaveLength(1);
    expect(servers.some((s) => s.username)).toBe(false);
  });

  it("never logs or leaks TURN credentials into the STUN-only fallback", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const servers = getIceServers();
    expect(JSON.stringify(servers)).not.toMatch(/secret|password/i);
  });

  it("gives each user a short-lived TURN login when TURN_SECRET is set", () => {
    process.env.STUN_SERVERS = "stun:a.example.com:3478";
    process.env.TURN_SERVER = "turn:relay.example.com:3478";
    process.env.TURN_SECRET = "shared-secret";
    process.env.TURN_USERNAME = "static";
    process.env.TURN_PASSWORD = "static-password";

    const before = Math.floor(Date.now() / 1000);
    const turn = getIceServers("user-1").find((s) => s.username)!;
    const [expiry, userId] = turn.username!.split(":");

    expect(userId).toBe("user-1");
    expect(Number(expiry)).toBeGreaterThanOrEqual(before + TURN_CREDENTIAL_TTL_SECONDS);
    expect(turn.credential).toBe(createHmac("sha1", "shared-secret").update(turn.username!).digest("base64"));
    // The static login is never handed out once a secret is configured.
    expect(JSON.stringify(turn)).not.toContain("static-password");
    expect(getIceServers("user-2").find((s) => s.username)!.credential).not.toBe(turn.credential);
  });

  it("omits TURN when a secret is set but there's no user to issue a login for", () => {
    process.env.TURN_SERVER = "turn:relay.example.com:3478";
    process.env.TURN_SECRET = "shared-secret";
    expect(getIceServers().some((s) => s.username)).toBe(false);
  });
});

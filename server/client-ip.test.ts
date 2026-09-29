import { describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import { isTrustedProxyAddress, normalizeForwardedHeaders } from "./client-ip";

function req(remoteAddress: string, headers: Record<string, string>): IncomingMessage {
  return { socket: { remoteAddress }, headers: { ...headers } } as unknown as IncomingMessage;
}

describe("isTrustedProxyAddress", () => {
  it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1", "10.1.2.3", "172.18.0.5", "192.168.1.9", "fd00::1"])(
    "trusts local/private peer %s",
    (ip) => expect(isTrustedProxyAddress(ip)).toBe(true),
  );
  it.each(["203.0.113.7", "8.8.8.8", "172.32.0.1", "2001:db8::1", "", undefined])("does not trust %s", (ip) =>
    expect(isTrustedProxyAddress(ip)).toBe(false),
  );
});

describe("normalizeForwardedHeaders", () => {
  it("ignores a spoofed X-Forwarded-For from a client connecting directly", () => {
    const r = req("203.0.113.7", { "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8", "x-forwarded-proto": "https" });
    normalizeForwardedHeaders(r);
    expect(r.headers["x-forwarded-for"]).toBe("203.0.113.7");
    expect(r.headers["x-real-ip"]).toBeUndefined();
    expect(r.headers["x-forwarded-proto"]).toBeUndefined();
  });

  it("takes the address a trusted proxy appended, not what the client prepended", () => {
    const r = req("172.18.0.3", { "x-forwarded-for": "1.2.3.4, 198.51.100.20", "x-forwarded-proto": "https" });
    normalizeForwardedHeaders(r);
    expect(r.headers["x-forwarded-for"]).toBe("198.51.100.20");
    expect(r.headers["x-forwarded-proto"]).toBe("https");
  });

  it("falls back to X-Real-IP, then the socket address, behind a trusted proxy", () => {
    const withRealIp = req("127.0.0.1", { "x-real-ip": "198.51.100.9" });
    normalizeForwardedHeaders(withRealIp);
    expect(withRealIp.headers["x-forwarded-for"]).toBe("198.51.100.9");

    const bare = req("127.0.0.1", {});
    normalizeForwardedHeaders(bare);
    expect(bare.headers["x-forwarded-for"]).toBe("127.0.0.1");
  });
});

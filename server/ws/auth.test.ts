import { afterEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import type { IncomingMessage } from "node:http";
import { prisma } from "@/lib/db/client";
import { signSessionToken } from "@/lib/auth/jwt";
import { hashSessionToken } from "@/lib/auth/resolve-session";
import { authenticateUpgrade } from "./auth";

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "wisp_session";
const createdUserIds: string[] = [];

afterEach(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

/** Signs a token the way login does: a JWT plus its AuthSession row. */
async function issueToken(user: { id: string; username: string; role: "USER" | "MODERATOR" | "ADMIN"; isGuest: boolean }) {
  const token = await signSessionToken({ sub: user.id, username: user.username, role: user.role, isGuest: user.isGuest });
  await prisma.authSession.create({
    data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) },
  });
  return token;
}

async function makeUser(overrides: Partial<{ status: "ACTIVE" | "SUSPENDED" | "BANNED" | "TIMEOUT"; role: "USER" | "MODERATOR" | "ADMIN"; statusUntil: Date }> = {}) {
  const user = await prisma.user.create({
    data: {
      username: `ws-auth-${nanoid(6)}`,
      isGuest: true,
      role: overrides.role ?? "USER",
      status: overrides.status ?? "ACTIVE",
      statusUntil: overrides.statusUntil,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

function fakeUpgradeRequest(cookieHeader: string | undefined): IncomingMessage {
  return { headers: { cookie: cookieHeader } } as IncomingMessage;
}

describe("authenticateUpgrade (WS handshake auth)", () => {
  it("returns null when no session cookie is present", async () => {
    const result = await authenticateUpgrade(fakeUpgradeRequest(undefined));
    expect(result).toBeNull();
  });

  it("returns null for a malformed/garbage token", async () => {
    const result = await authenticateUpgrade(fakeUpgradeRequest(`${AUTH_COOKIE_NAME}=not-a-real-jwt`));
    expect(result).toBeNull();
  });

  it("authenticates a valid session for an active user", async () => {
    const user = await makeUser();
    const token = await issueToken(user);

    const result = await authenticateUpgrade(fakeUpgradeRequest(`${AUTH_COOKIE_NAME}=${token}`));
    expect(result).toEqual({
      userId: user.id,
      username: user.username,
      isGuest: user.isGuest,
      role: user.role,
    });
  });

  it("rejects a valid token belonging to a banned user", async () => {
    const user = await makeUser({ status: "BANNED" });
    const token = await issueToken(user);

    const result = await authenticateUpgrade(fakeUpgradeRequest(`${AUTH_COOKIE_NAME}=${token}`));
    expect(result).toBeNull();
  });

  it("rejects a valid token belonging to a suspended user", async () => {
    const user = await makeUser({ status: "SUSPENDED" });
    const token = await issueToken(user);

    const result = await authenticateUpgrade(fakeUpgradeRequest(`${AUTH_COOKIE_NAME}=${token}`));
    expect(result).toBeNull();
  });

  it("rejects a token for a user that no longer exists", async () => {
    const token = await signSessionToken({
      sub: "user_deleted_long_ago",
      username: "ghost",
      role: "USER",
      isGuest: true,
    });
    const result = await authenticateUpgrade(fakeUpgradeRequest(`${AUTH_COOKIE_NAME}=${token}`));
    expect(result).toBeNull();
  });

  it("parses cookies correctly among multiple cookie pairs", async () => {
    const user = await makeUser({ role: "ADMIN" });
    const token = await issueToken(user);
    const header = `other=1; ${AUTH_COOKIE_NAME}=${token}; another=2`;
    const result = await authenticateUpgrade(fakeUpgradeRequest(header));
    expect(result?.role).toBe("ADMIN");
  });
});

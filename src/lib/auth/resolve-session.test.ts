import { afterEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db/client";
import { signSessionToken } from "./jwt";
import { hashSessionToken, resolveSession } from "./resolve-session";

const createdUserIds: string[] = [];

afterEach(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

async function signIn(overrides: { role?: "USER" | "MODERATOR" | "ADMIN" } = {}) {
  const user = await prisma.user.create({
    data: { username: `rs-${nanoid(8)}`, isGuest: true, role: overrides.role ?? "USER" },
  });
  createdUserIds.push(user.id);
  const token = await signSessionToken({ sub: user.id, username: user.username, role: user.role, isGuest: true });
  await prisma.authSession.create({
    data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) },
  });
  return { user, token };
}

describe("resolveSession", () => {
  it("resolves a live session", async () => {
    const { user, token } = await signIn();
    const session = await resolveSession(token);
    expect(session).toMatchObject({ sub: user.id, role: "USER", timedOut: false, timedOutUntil: null });
  });

  it("rejects a validly signed token that has no session row (e.g. forged or never issued)", async () => {
    const { user } = await signIn();
    const orphan = await signSessionToken({ sub: user.id, username: user.username, role: "ADMIN", isGuest: true });
    expect(await resolveSession(orphan)).toBeNull();
  });

  it("rejects a token after logout / password reset revokes its session", async () => {
    const { token } = await signIn();
    await prisma.authSession.update({ where: { tokenHash: hashSessionToken(token) }, data: { revokedAt: new Date() } });
    expect(await resolveSession(token)).toBeNull();
  });

  it("rejects an expired session row", async () => {
    const { token } = await signIn();
    await prisma.authSession.update({ where: { tokenHash: hashSessionToken(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveSession(token)).toBeNull();
  });

  it.each(["BANNED", "SUSPENDED", "DELETED"] as const)("rejects a %s account even with a live session", async (status) => {
    const { user, token } = await signIn();
    await prisma.user.update({ where: { id: user.id }, data: { status } });
    expect(await resolveSession(token)).toBeNull();
  });

  it("takes the role from the database, so a demoted admin loses admin at once", async () => {
    const { user, token } = await signIn({ role: "ADMIN" });
    await prisma.user.update({ where: { id: user.id }, data: { role: "USER" } });
    expect((await resolveSession(token))?.role).toBe("USER");
  });

  it("reports a running timeout, and clears it once it has expired", async () => {
    const { user, token } = await signIn();
    const until = new Date(Date.now() + 60_000);
    await prisma.user.update({ where: { id: user.id }, data: { status: "TIMEOUT", statusUntil: until } });
    expect((await resolveSession(token))?.timedOutUntil).toEqual(until);

    await prisma.user.update({ where: { id: user.id }, data: { statusUntil: new Date(Date.now() - 1000) } });
    expect((await resolveSession(token))?.timedOut).toBe(false);
  });

  it("treats a timeout with no end date as running", async () => {
    const { user, token } = await signIn();
    await prisma.user.update({ where: { id: user.id }, data: { status: "TIMEOUT", statusUntil: null } });
    expect((await resolveSession(token))?.timedOut).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";

const { getCurrentUserMock } = vi.hoisted(() => ({ getCurrentUserMock: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: getCurrentUserMock }));

const { GET, PATCH } = await import("./route");

const createdUserIds: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({
    data: { username: `notif-test-${Math.random().toString(36).slice(2, 8)}`, isGuest: true },
  });
  createdUserIds.push(user.id);
  return user.id;
}

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/notifications", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

afterEach(async () => {
  getCurrentUserMock.mockReset();
  if (createdUserIds.length) {
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

describe("GET /api/notifications", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns notifications newest-first with an accurate unread count", async () => {
    const userId = await makeUser();
    getCurrentUserMock.mockResolvedValue({ sub: userId });

    await prisma.notification.create({ data: { userId, type: "SYSTEM", title: "Older", readAt: new Date() } });
    await new Promise((r) => setTimeout(r, 5));
    await prisma.notification.create({ data: { userId, type: "ACHIEVEMENT", title: "Newer", readAt: null } });

    const res = await GET();
    const body = await res.json();
    expect(body.unreadCount).toBe(1);
    expect(body.notifications).toHaveLength(2);
    expect(body.notifications[0].title).toBe("Newer");
  });

  it("only returns the current user's notifications", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await prisma.notification.create({ data: { userId: userB, type: "SYSTEM", title: "Not yours" } });

    getCurrentUserMock.mockResolvedValue({ sub: userA });
    const res = await GET();
    const body = await res.json();
    expect(body.notifications).toHaveLength(0);
  });
});

describe("PATCH /api/notifications", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await PATCH(patchRequest({}));
    expect(res.status).toBe(401);
  });

  it("marks a single notification read by id", async () => {
    const userId = await makeUser();
    getCurrentUserMock.mockResolvedValue({ sub: userId });
    const n1 = await prisma.notification.create({ data: { userId, type: "SYSTEM", title: "A" } });
    await prisma.notification.create({ data: { userId, type: "SYSTEM", title: "B" } });

    const res = await PATCH(patchRequest({ id: n1.id }));
    const body = await res.json();
    expect(body.unreadCount).toBe(1);

    const refreshed = await prisma.notification.findUnique({ where: { id: n1.id } });
    expect(refreshed?.readAt).not.toBeNull();
  });

  it("marks all notifications read when no id is given", async () => {
    const userId = await makeUser();
    getCurrentUserMock.mockResolvedValue({ sub: userId });
    await prisma.notification.createMany({
      data: [
        { userId, type: "SYSTEM", title: "A" },
        { userId, type: "SYSTEM", title: "B" },
      ],
    });

    const res = await PATCH(patchRequest({}));
    const body = await res.json();
    expect(body.unreadCount).toBe(0);

    const stillUnread = await prisma.notification.count({ where: { userId, readAt: null } });
    expect(stillUnread).toBe(0);
  });

  it("does not let a user mark another user's notification as read", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const theirs = await prisma.notification.create({ data: { userId: userB, type: "SYSTEM", title: "B's" } });

    getCurrentUserMock.mockResolvedValue({ sub: userA });
    await PATCH(patchRequest({ id: theirs.id }));

    const refreshed = await prisma.notification.findUnique({ where: { id: theirs.id } });
    expect(refreshed?.readAt).toBeNull();
  });
});

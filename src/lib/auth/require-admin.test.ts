import { afterEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "./session";

const { getCurrentUserMock } = vi.hoisted(() => ({ getCurrentUserMock: vi.fn() }));

// require-admin.ts imports the Next.js "server-only" build-time marker,
// which throws outside Next's own bundler (it relies on a webpack/turbopack
// "react-server" resolve condition that plain Node/Vitest doesn't set).
vi.mock("server-only", () => ({}));

vi.mock("./session", () => ({
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { requireAdmin, requireFullAdmin } = await import("./require-admin");

function userWithRole(role: CurrentUser["role"]): CurrentUser {
  return { sub: "u1", username: "mod", role, isGuest: false, timedOut: false, timedOutUntil: null };
}

afterEach(() => {
  getCurrentUserMock.mockReset();
});

describe("requireAdmin (MODERATOR or ADMIN)", () => {
  it("allows an ADMIN through", async () => {
    getCurrentUserMock.mockResolvedValue(userWithRole("ADMIN"));
    await expect(requireAdmin()).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("allows a MODERATOR through", async () => {
    getCurrentUserMock.mockResolvedValue(userWithRole("MODERATOR"));
    await expect(requireAdmin()).resolves.toMatchObject({ role: "MODERATOR" });
  });

  it("redirects a plain USER to /login", async () => {
    getCurrentUserMock.mockResolvedValue(userWithRole("USER"));
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects an unauthenticated request to /login", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login");
  });
});

describe("requireFullAdmin (ADMIN only)", () => {
  it("allows an ADMIN through", async () => {
    getCurrentUserMock.mockResolvedValue(userWithRole("ADMIN"));
    await expect(requireFullAdmin()).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("redirects a MODERATOR (insufficient privilege for full-admin actions)", async () => {
    getCurrentUserMock.mockResolvedValue(userWithRole("MODERATOR"));
    await expect(requireFullAdmin()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects a plain USER", async () => {
    getCurrentUserMock.mockResolvedValue(userWithRole("USER"));
    await expect(requireFullAdmin()).rejects.toThrow("REDIRECT:/login");
  });
});

import { describe, expect, it } from "vitest";
import { moderationDenial } from "./permissions";

const user = { id: "u", role: "USER" as const };
const mod = { id: "m", role: "MODERATOR" as const };
const mod2 = { id: "m2", role: "MODERATOR" as const };
const admin = { id: "a", role: "ADMIN" as const };
const admin2 = { id: "a2", role: "ADMIN" as const };

describe("moderationDenial", () => {
  it("lets moderators warn, time out and suspend regular users", () => {
    for (const type of ["WARNING", "TIMEOUT", "SUSPENSION"] as const) {
      expect(moderationDenial(mod, user, type)).toBeNull();
    }
  });

  it("keeps bans and unbans for admins", () => {
    expect(moderationDenial(mod, user, "BAN")).toMatch(/Only admins/);
    expect(moderationDenial(admin, user, "BAN")).toBeNull();
  });

  it("stops staff acting on equal or higher roles", () => {
    expect(moderationDenial(mod, admin, "SUSPENSION")).not.toBeNull();
    expect(moderationDenial(mod, mod2, "TIMEOUT")).not.toBeNull();
    expect(moderationDenial(admin, admin2, "BAN")).not.toBeNull();
    expect(moderationDenial(admin, mod, "SUSPENSION")).toBeNull();
  });

  it("stops anyone acting on themselves, and regular users acting at all", () => {
    expect(moderationDenial(admin, admin, "BAN")).not.toBeNull();
    expect(moderationDenial(user, { id: "x", role: "USER" }, "WARNING")).not.toBeNull();
  });
});

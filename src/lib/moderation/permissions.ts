import type { AccountRole, ModerationActionType } from "@prisma/client";

const RANK: Record<AccountRole, number> = { USER: 0, MODERATOR: 1, ADMIN: 2 };

/**
 * Why `issuer` may not apply `type` to `target`, or null if they may.
 * Staff can only act on accounts ranked below them (a moderator can't
 * suspend an admin or another moderator), nobody can act on themselves,
 * and only admins ban or unban.
 */
export function moderationDenial(
  issuer: { id: string; role: AccountRole },
  target: { id: string; role: AccountRole },
  type: ModerationActionType,
): string | null {
  if (RANK[issuer.role] < RANK.MODERATOR) return "Only moderators and admins can do this.";
  if (issuer.id === target.id) return "You can't moderate your own account.";
  if (RANK[issuer.role] <= RANK[target.role]) return "You can only moderate accounts with a lower role than yours.";
  if ((type === "BAN" || type === "UNBAN") && issuer.role !== "ADMIN") return "Only admins can ban or unban accounts.";
  return null;
}

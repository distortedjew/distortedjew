import { prisma } from "@/lib/db/client";
import type { ModerationActionType } from "@prisma/client";

export interface ApplyModerationActionInput {
  targetId: string;
  issuerId: string | null;
  type: ModerationActionType;
  reason: string;
  reportId?: string;
  timeoutMinutes?: number;
  automated?: boolean;
}

/**
 * Single choke point for every account-level moderation decision (manual,
 * from the admin dashboard, or automated from the AI moderation pipeline).
 * Always logs a ModerationAction row — nothing changes a user's status
 * silently.
 */
export async function applyModerationAction(input: ApplyModerationActionInput) {
  const expiresAt =
    input.type === "TIMEOUT" && input.timeoutMinutes
      ? new Date(Date.now() + input.timeoutMinutes * 60 * 1000)
      : undefined;

  const action = await prisma.moderationAction.create({
    data: {
      targetId: input.targetId,
      issuerId: input.issuerId,
      type: input.type,
      reason: input.reason,
      reportId: input.reportId,
      automated: input.automated ?? false,
      expiresAt,
    },
  });

  switch (input.type) {
    case "TIMEOUT":
      await prisma.user.update({
        where: { id: input.targetId },
        data: { status: "TIMEOUT", statusReason: input.reason, statusUntil: expiresAt },
      });
      break;
    case "SUSPENSION":
      await prisma.user.update({
        where: { id: input.targetId },
        data: { status: "SUSPENDED", statusReason: input.reason, statusUntil: null },
      });
      break;
    case "BAN":
      await prisma.user.update({
        where: { id: input.targetId },
        data: { status: "BANNED", statusReason: input.reason, statusUntil: null },
      });
      break;
    case "UNBAN":
      await prisma.user.update({
        where: { id: input.targetId },
        data: { status: "ACTIVE", statusReason: null, statusUntil: null },
      });
      break;
    case "WARNING":
    case "NOTE":
      // No status change — logged for the record and (for warnings) surfaced to the user.
      break;
  }

  // Force sign-out everywhere for anything that removes access.
  if (input.type === "SUSPENSION" || input.type === "BAN") {
    await prisma.authSession.updateMany({
      where: { userId: input.targetId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  if (input.type === "WARNING" || input.type === "SUSPENSION" || input.type === "BAN") {
    await prisma.notification.create({
      data: {
        userId: input.targetId,
        type: "MODERATION",
        title:
          input.type === "WARNING"
            ? "You received a warning"
            : input.type === "SUSPENSION"
              ? "Your account has been suspended"
              : "Your account has been banned",
        body: input.reason,
      },
    });
  }

  return action;
}

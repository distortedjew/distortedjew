import { z } from "zod";

export const resolveReportSchema = z.object({
  action: z.enum(["DISMISS", "WARNING", "TIMEOUT", "SUSPENSION", "BAN"]),
  reason: z.string().trim().max(500).optional(),
  timeoutMinutes: z.number().int().min(1).max(60 * 24 * 7).optional(),
});

export const moderateUserSchema = z.object({
  type: z.enum(["WARNING", "TIMEOUT", "SUSPENSION", "BAN", "UNBAN"]),
  reason: z.string().trim().min(1).max(500),
  timeoutMinutes: z.number().int().min(1).max(60 * 24 * 7).optional(),
});

import { z } from "zod";

export const createReportSchema = z.object({
  reportedId: z.string().min(1),
  category: z.enum([
    "HARASSMENT", "SPAM", "SEXUAL_CONTENT", "HATE_ABUSE",
    "THREATS", "SCAM", "IMPERSONATION", "OTHER",
  ]),
  description: z.string().max(1000).optional(),
  matchId: z.string().optional(),
  roomId: z.string().optional(),
});

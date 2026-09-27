import { z } from "zod";
import { MAX_ROOM_PARTICIPANTS, MIN_ROOM_PARTICIPANTS } from "@/lib/constants";

export const createRoomSchema = z.object({
  title: z.string().trim().min(3).max(60),
  topic: z.string().trim().max(120).optional(),
  interests: z.array(z.string()).max(6).optional(),
  rules: z.string().trim().max(300).optional(),
  channel: z.enum(["TEXT", "VOICE", "VIDEO"]).default("TEXT"),
  maxParticipants: z.number().int().min(MIN_ROOM_PARTICIPANTS).max(MAX_ROOM_PARTICIPANTS).default(8),
  isPrivate: z.boolean().default(false),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

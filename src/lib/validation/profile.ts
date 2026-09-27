import { z } from "zod";

export const INTEREST_OPTIONS = [
  "Gaming", "Music", "Travel", "Fitness", "Movies", "Anime", "Technology",
  "Programming", "Sports", "Art", "Fashion", "Food", "Cars", "Memes",
  "Languages", "Books", "Photography", "Nature", "Science", "Comedy",
] as const;

export const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "ru", label: "Russian" },
  { code: "tr", label: "Turkish" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
] as const;

export const updateProfileSchema = z.object({
  displayName: z.string().trim().max(40).optional(),
  bio: z.string().trim().max(280).optional(),
  interests: z.array(z.string()).max(12).optional(),
  languages: z.array(z.string()).max(6).optional(),
  country: z.string().length(2).optional().nullable(),
  visibility: z.enum(["PUBLIC", "CONNECTIONS_ONLY", "PRIVATE"]).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

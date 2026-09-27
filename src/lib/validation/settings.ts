import { z } from "zod";

export const updateSettingsSchema = z.object({
  preferredLanguage: z.string().min(2).max(8).optional(),
  soundEffectsEnabled: z.boolean().optional(),
  notifyOnConnection: z.boolean().optional(),
  notifyOnMessage: z.boolean().optional(),
  autoTranslate: z.boolean().optional(),
  safeModeStrict: z.boolean().optional(),
  showCountry: z.boolean().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

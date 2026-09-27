import type { MatchMode } from "@/types/ws";

export const MODE_OPTIONS: Array<{ value: MatchMode; label: string; description: string }> = [
  { value: "RANDOM", label: "Random", description: "Anyone, anywhere — pure chance." },
  { value: "INTERESTS", label: "Shared interests", description: "Matched by what you're both into." },
  { value: "SAME_LANGUAGE", label: "Same language", description: "Chat comfortably in your language." },
  { value: "LANGUAGE_EXCHANGE", label: "Language exchange", description: "Practice a language with a native speaker." },
  { value: "SAME_COUNTRY", label: "Same country", description: "Meet someone from your own country." },
  { value: "WORLDWIDE", label: "Worldwide", description: "Prioritize meeting someone far away." },
  { value: "GAMING", label: "Gaming", description: "For people who want to talk games." },
  { value: "MUSIC", label: "Music", description: "For people who want to talk music." },
  { value: "JUST_TALKING", label: "Just talking", description: "No agenda — just a good conversation." },
];

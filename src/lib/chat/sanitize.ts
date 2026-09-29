import { INTEREST_OPTIONS } from "@/lib/validation/profile";
import type { ChatMessagePayload, MatchChannel, MatchFilters, MatchMode } from "@/types/ws";

/** The only reactions the chat UI offers; anything else is dropped server-side. */
export const QUICK_REACTIONS = ["👍", "😂", "❤️", "😮", "😢", "🔥"] as const;

export function isAllowedReaction(emoji: unknown): emoji is (typeof QUICK_REACTIONS)[number] {
  return typeof emoji === "string" && (QUICK_REACTIONS as readonly string[]).includes(emoji);
}

/** Kinds a client may send. SYSTEM/GAME_EVENT etc. are server-generated only. */
const CLIENT_MESSAGE_KINDS = ["TEXT", "MUSIC_SHARE"] as const;
export type ClientMessageKind = (typeof CLIENT_MESSAGE_KINDS)[number];

export function clientMessageKind(kind: unknown): ClientMessageKind {
  return (CLIENT_MESSAGE_KINDS as readonly unknown[]).includes(kind) ? (kind as ClientMessageKind) : "TEXT";
}

export interface MusicShareMetadata {
  title: string;
  artist: string;
  url?: string;
}

function shortString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

/** Only http(s) links, so a shared "song" can't be a javascript: URL. */
export function safeHttpUrl(value: unknown): string | undefined {
  const raw = shortString(value, 500);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Message metadata is client-supplied and stored, so it's rebuilt from
 * known fields rather than copied: nothing else gets into the database.
 */
export function sanitizeMessageMetadata(
  kind: ClientMessageKind,
  metadata: unknown,
): MusicShareMetadata | undefined {
  if (kind !== "MUSIC_SHARE" || !metadata || typeof metadata !== "object") return undefined;
  const m = metadata as Record<string, unknown>;
  const title = shortString(m.title, 100);
  const artist = shortString(m.artist, 100);
  if (!title || !artist) return undefined;
  return { title, artist, url: safeHttpUrl(m.url) };
}

const MATCH_MODES: MatchMode[] = [
  "RANDOM", "INTERESTS", "SAME_LANGUAGE", "LANGUAGE_EXCHANGE",
  "SAME_COUNTRY", "WORLDWIDE", "GAMING", "MUSIC", "JUST_TALKING",
];
const MATCH_CHANNELS: MatchChannel[] = ["TEXT", "VOICE", "VIDEO"];
const MAX_INTERESTS = 8;

/** Queue filters come straight from the client; keep only known values. */
export function sanitizeMatchFilters(input: unknown): MatchFilters {
  const f = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const interests = Array.isArray(f.interests)
    ? f.interests.filter((i): i is string => (INTEREST_OPTIONS as readonly unknown[]).includes(i)).slice(0, MAX_INTERESTS)
    : [];
  const language = typeof f.language === "string" && /^[a-z]{2,3}$/i.test(f.language) ? f.language : null;
  const country = typeof f.country === "string" && /^[A-Z]{2}$/.test(f.country) ? f.country : null;
  return {
    mode: MATCH_MODES.includes(f.mode as MatchMode) ? (f.mode as MatchMode) : "RANDOM",
    channel: MATCH_CHANNELS.includes(f.channel as MatchChannel) ? (f.channel as MatchChannel) : "TEXT",
    interests: [...new Set(interests)],
    language,
    country,
  };
}

export type { ChatMessagePayload };

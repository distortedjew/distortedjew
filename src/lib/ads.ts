/**
 * Ad configuration (Google AdSense). Everything is off unless
 * NEXT_PUBLIC_ADSENSE_CLIENT is set. These are NEXT_PUBLIC_ values, so
 * they're baked into the page at build time: rebuild after changing them.
 *
 * Ads only go on content pages (landing, games). AdSense doesn't allow them
 * on screens without publisher content (waiting, "chat ended", login), and
 * they'd get in the way of a live conversation anyway.
 */
export type AdPlacement = "landing" | "games";

/** "ca-pub-1234567890123456" style client IDs only. */
const CLIENT_PATTERN = /^ca-pub-\d{10,20}$/;
const SLOT_PATTERN = /^\d{5,20}$/;

function valid(pattern: RegExp, value: string | undefined): string | null {
  const v = value?.trim();
  return v && pattern.test(v) ? v : null;
}

export function adsenseClient(env: Record<string, string | undefined> = defaultEnv()): string | null {
  return valid(CLIENT_PATTERN, env.NEXT_PUBLIC_ADSENSE_CLIENT);
}

export function adSlotId(placement: AdPlacement, env: Record<string, string | undefined> = defaultEnv()): string | null {
  const raw = placement === "landing" ? env.NEXT_PUBLIC_ADSENSE_SLOT_LANDING : env.NEXT_PUBLIC_ADSENSE_SLOT_GAMES;
  return valid(SLOT_PATTERN, raw);
}

/** Show labelled empty boxes where ads would go, to preview placements without an AdSense account. */
export function showAdPlaceholders(env: Record<string, string | undefined> = defaultEnv()): boolean {
  return env.NEXT_PUBLIC_AD_PLACEHOLDERS === "true";
}

/** The ads.txt line AdSense requires, or null when ads are off. */
export function adsTxt(env: Record<string, string | undefined> = defaultEnv()): string | null {
  const client = adsenseClient(env);
  if (!client) return null;
  // f08c47fec0942fa0 is Google's published certification authority ID.
  return `google.com, ${client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`;
}

// NEXT_PUBLIC_* values are only inlined into client code when read by their
// literal names, so they're listed out here rather than read dynamically.
function defaultEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_ADSENSE_CLIENT: process.env.NEXT_PUBLIC_ADSENSE_CLIENT,
    NEXT_PUBLIC_ADSENSE_SLOT_LANDING: process.env.NEXT_PUBLIC_ADSENSE_SLOT_LANDING,
    NEXT_PUBLIC_ADSENSE_SLOT_GAMES: process.env.NEXT_PUBLIC_ADSENSE_SLOT_GAMES,
    NEXT_PUBLIC_AD_PLACEHOLDERS: process.env.NEXT_PUBLIC_AD_PLACEHOLDERS,
  };
}

/** Central brand copy — single source of truth so taglines stay consistent across the landing page, page metadata, manifest, and share cards. */

export const TAGLINE = "Meet someone you've never met.";
export const SUBLINE = "Talk. Play. Connect.";

/** ~150-160 chars, tuned for meta/OG description length. */
export const DESCRIPTION =
  "Wisp is where strangers become stories — instant text, voice, and video chat with real people, matched by interest, language, or pure chance.";

/** Compact pitch for tight spaces (manifest short description, share previews). */
export const SHORT_PITCH = "Real people. Real conversations. One click away.";

/** Rotating flavor lines shown while matching — pure delight, no functional meaning. */
export const SEARCHING_HOOKS = [
  "New person, new story.",
  "Say hi to someone new.",
  "No feeds. No profiles. Just people.",
  "Every wisp leads somewhere new.",
  "The next conversation is one click away.",
] as const;

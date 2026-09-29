/**
 * Returns `target` only if it's a path on this site, otherwise `fallback`.
 *
 * Used for "?next=" after login: without this, /login?next=https://evil.example
 * would send someone to another site right after they signed in.
 */
export function safeRedirectPath(target: string | null | undefined, fallback = "/discover"): string {
  if (!target) return fallback;
  // Must be a single-slash absolute path. "//host" and "/\\host" are
  // protocol-relative URLs that browsers resolve to another origin.
  if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return fallback;
  // Reject control characters, which some browsers strip before parsing.
  if (/[\u0000-\u001f\u007f]/.test(target)) return fallback;
  try {
    const url = new URL(target, "http://wisp.local");
    if (url.origin !== "http://wisp.local") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

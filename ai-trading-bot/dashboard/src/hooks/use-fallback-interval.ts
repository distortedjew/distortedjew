import { useLiveStore } from "@/stores/live";

/** Default polling period used when the WebSocket is not live. */
export const FALLBACK_POLL_MS = 5_000;

/**
 * `refetchInterval` for WebSocket-fed queries: no polling while the stream is live,
 * polling every `ms` while connecting / reconnecting / offline so the UI never freezes.
 */
export function useFallbackInterval(ms: number = FALLBACK_POLL_MS): number | false {
  const live = useLiveStore((s) => s.connection === "live");
  return live ? false : ms;
}

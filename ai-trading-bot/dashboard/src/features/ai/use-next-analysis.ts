import { useStatus } from "@/hooks/queries";
import { formatAgo, formatTime } from "@/lib/format";
import { useNow } from "@/lib/time";

/** "Next analysis at 14:35 (in 2m 13s)" from the engine status. */
export function useNextAnalysis(): { atMs: number | null; label: string | null } {
  const status = useStatus();
  const now = useNow();
  const next = status.data?.engine?.next_analysis_at;
  const atMs = next ? Date.parse(next) : null;
  if (!atMs) return { atMs: null, label: null };
  const inSec = (atMs - now) / 1_000;
  return {
    atMs,
    label:
      inSec > 1
        ? `next at ${formatTime(atMs, { seconds: false })} (${formatAgo(-inSec)})`
        : "next analysis running…",
  };
}

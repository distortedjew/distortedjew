import type { Regime, RegimeSegment } from "@/types";

export interface TimelineSegment {
  regime: Regime;
  /** Offset and width in percent of the window. */
  leftPct: number;
  widthPct: number;
  startMs: number;
  endMs: number;
  confidence: number;
  current: boolean;
}

/**
 * Clip regime segments (oldest first, the last one open-ended) to a time window and convert them
 * to percentages of the window for a timeline strip. Segments outside the window are dropped.
 */
export function timelineSegments(
  history: readonly RegimeSegment[],
  windowStartMs: number,
  windowEndMs: number,
): TimelineSegment[] {
  const span = windowEndMs - windowStartMs;
  if (span <= 0) return [];
  const out: TimelineSegment[] = [];
  for (const seg of history) {
    const start = Date.parse(seg.start);
    const end = seg.end ? Date.parse(seg.end) : windowEndMs;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const s = Math.max(start, windowStartMs);
    const e = Math.min(end, windowEndMs);
    if (e <= s) continue;
    out.push({
      regime: seg.regime,
      leftPct: ((s - windowStartMs) / span) * 100,
      widthPct: ((e - s) / span) * 100,
      startMs: start,
      endMs: end,
      confidence: seg.confidence,
      current: seg.end === null,
    });
  }
  return out;
}

/** Share of the window spent in each regime (percent), largest first. */
export function regimeShares(segments: readonly TimelineSegment[]): { regime: Regime; pct: number }[] {
  const totals = new Map<Regime, number>();
  for (const s of segments) totals.set(s.regime, (totals.get(s.regime) ?? 0) + s.widthPct);
  return [...totals.entries()].map(([regime, pct]) => ({ regime, pct })).sort((a, b) => b.pct - a.pct);
}

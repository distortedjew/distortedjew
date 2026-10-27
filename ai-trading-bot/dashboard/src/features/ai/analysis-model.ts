/**
 * Pure derivations for AI analysis views (no React): risk/reward and level distances,
 * reasoning text → sections, and the plain-language "does confidence predict results?" verdict.
 */
import { formatNumber, formatPct, isNum } from "@/lib/format";
import type { AIAnalysis, ConfidenceBucket, Tone } from "@/types";

/** "1 : 2.4" (— when missing). */
export function formatRiskReward(rr: number | null | undefined): string {
  if (!isNum(rr)) return "—";
  return `1 : ${formatNumber(rr, rr >= 10 ? 0 : 1)}`;
}

/** Signed distance of a level from the entry in percent (positive = above entry). */
export function levelDistancePct(
  entry: number | null | undefined,
  level: number | null | undefined,
): number | null {
  if (!isNum(entry) || !isNum(level) || entry === 0) return null;
  return ((level - entry) / entry) * 100;
}

export interface ReasoningSection {
  /** "Structure (5m)" — the text before the first colon, when it reads like a heading. */
  title: string | null;
  body: string;
}

/**
 * Split the analyst's free-text reasoning into readable sections: paragraphs separated by blank
 * lines; a short leading "Heading:" becomes the section title.
 */
export function parseReasoning(text: string | null | undefined): ReasoningSection[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const match = /^([A-Z][^:.\n]{1,40}):\s+([\s\S]+)$/.exec(paragraph);
      if (match) return { title: match[1], body: match[2].trim() };
      return { title: null, body: paragraph };
    });
}

/** Split a section body into clauses on "; " for bullet rendering (keeps short bodies whole). */
export function splitClauses(body: string): string[] {
  const parts = body
    .split(/;\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [body];
}

/** True when the analyst produced trade levels (directional signal with entry / stop / target). */
export function hasLevels(a: Pick<AIAnalysis, "signal" | "entry" | "stop_loss" | "take_profit">): boolean {
  return a.signal !== "HOLD" && isNum(a.entry) && isNum(a.stop_loss) && isNum(a.take_profit);
}

/** The headline line for a decision, e.g. "LONG · 78%" (used in feeds and aria labels). */
export function decisionHeadline(a: Pick<AIAnalysis, "signal" | "confidence">): string {
  return `${a.signal} · ${formatPct(a.confidence, { decimals: 0 })}`;
}

// ---------------------------------------------------------------- confidence verdict

export interface ConfidenceVerdict {
  /** One plain-language sentence. */
  text: string;
  tone: Tone;
  /** "better" | "worse" | "flat" | "insufficient". */
  kind: "better" | "worse" | "flat" | "insufficient";
  /** Closed trades the verdict is based on. */
  n: number;
  /** Small sample: say so next to the verdict. */
  smallSample: boolean;
}

/** Minimum closed trades in a bucket for it to count. */
export const MIN_BUCKET_TRADES = 3;
/** Minimum closed trades overall before any verdict. */
export const MIN_VERDICT_TRADES = 15;
/** Below this the verdict is flagged as a small sample. */
export const SMALL_SAMPLE_TRADES = 100;
/** Win-rate gap (percentage points) between the upper and lower confidence halves that counts. */
export const VERDICT_GAP_PP = 5;

/**
 * Does higher AI confidence correspond to better trades? Compares the trade-weighted win rate of
 * the upper confidence buckets with the lower ones (buckets with ≥ MIN_BUCKET_TRADES closed trades,
 * split at the trade-weighted median bucket). Honest about small samples.
 */
export function confidenceVerdict(buckets: readonly ConfidenceBucket[]): ConfidenceVerdict {
  const usable = buckets
    .filter((b) => b.trades >= MIN_BUCKET_TRADES && isNum(b.win_rate))
    .sort((a, b) => a.min - b.min);
  const n = buckets.reduce((sum, b) => sum + b.trades, 0);
  const smallSample = n < SMALL_SAMPLE_TRADES;

  if (n < MIN_VERDICT_TRADES || usable.length < 2) {
    return {
      kind: "insufficient",
      tone: "muted",
      n,
      smallSample: true,
      text:
        n === 0
          ? "No closed AI trades yet — the verdict appears once trades from several confidence levels have closed."
          : `Too few closed trades across confidence levels to tell whether higher confidence means better trades (n = ${n}).`,
    };
  }

  // Split into a lower and an upper group with roughly equal trade counts (at least one bucket each).
  const usableTrades = usable.reduce((s, b) => s + b.trades, 0);
  let split = 1;
  let acc = usable[0].trades;
  while (split < usable.length - 1 && acc + usable[split].trades <= usableTrades / 2) {
    acc += usable[split].trades;
    split += 1;
  }
  const lower = usable.slice(0, split);
  const upper = usable.slice(split);
  const rate = (group: ConfidenceBucket[]) => {
    const trades = group.reduce((s, b) => s + b.trades, 0);
    const wins = group.reduce((s, b) => s + b.wins, 0);
    return trades ? (wins / trades) * 100 : 0;
  };
  const lowRate = rate(lower);
  const highRate = rate(upper);
  const gap = highRate - lowRate;
  const cut = formatPct(upper[0].min, { decimals: 0 });
  const detail = `${formatPct(highRate, { decimals: 0 })} win rate at ≥ ${cut} confidence vs ${formatPct(lowRate, { decimals: 0 })} below`;
  const suffix = `(n = ${n}${smallSample ? ", small sample" : ""})`;

  if (gap >= VERDICT_GAP_PP) {
    return {
      kind: "better",
      tone: "up",
      n,
      smallSample,
      text: `Higher confidence has meant better trades so far: ${detail} ${suffix}.`,
    };
  }
  if (gap <= -VERDICT_GAP_PP) {
    return {
      kind: "worse",
      tone: "down",
      n,
      smallSample,
      text: `Higher confidence has not meant better trades so far: ${detail} ${suffix}.`,
    };
  }
  return {
    kind: "flat",
    tone: "warning",
    n,
    smallSample,
    text: `Higher confidence has made little difference so far: ${detail} ${suffix}.`,
  };
}

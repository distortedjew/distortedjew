import { TREND_META } from "@/lib/constants";
import type { MTFReport } from "@/types";

/** Tone of the alignment headline: a full bull / bear stack is green / red, partial is muted. */
export function alignmentTone(report: Pick<MTFReport, "aligned_count" | "total" | "dominant">) {
  if (report.dominant === "NEUTRAL" || report.total === 0) return "neutral" as const;
  const tone = TREND_META[report.dominant].tone;
  return report.aligned_count / report.total >= 0.75 ? tone : ("warning" as const);
}

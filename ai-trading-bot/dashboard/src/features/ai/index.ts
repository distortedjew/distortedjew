/**
 * AI feature: the canonical decision renderer and AI widgets.
 *
 *   import { AnalysisDetails, LatestDecisionCard } from "@/features/ai";
 */
export { AnalysisDetails, type AnalysisDetailsProps } from "./AnalysisDetails";
export { confidenceVerdict, formatRiskReward } from "./analysis-model";
export { LatestDecisionCard, LiveAnalysisCard } from "./LiveAnalysis";
export { EvidenceList, RiskVerdict, SignalPill } from "./parts";

import type { NewsCategory } from "@/lib/news/types";
import type { ImpactDriverKey } from "@/lib/news/impact-framework";

export type RangeImpactDirection = "positive" | "negative" | "neutral";
export type ImpactStrength = "low" | "medium" | "high";
export type TimeHorizon = "immediate" | "near_term" | "medium_term" | "long_term";

/**
 * Phase 3 output contract. Deliberately separate from NormalizedArticle: an
 * AiAnalysisResult is model-generated interpretation and must never be
 * stored or rendered merged into the factual article record without the
 * distinction preserved (CLAUDE.md: never merge data of different
 * provenance silently).
 */
export type AiAnalysisResult = {
  summary: string;
  rangeImpact: RangeImpactDirection;
  impactStrength: ImpactStrength;
  affectedDrivers: ImpactDriverKey[];
  rangeAnalysis: string;
  timeHorizon: TimeHorizon;
  confidence: number;
  aiProvider: string;
  aiModel: string;
  impactFrameworkVersion: string;
  analyzedAt: string;
};

export class AiAnalysisValidationError extends Error {}

const RANGE_IMPACT_VALUES: RangeImpactDirection[] = ["positive", "negative", "neutral"];
const IMPACT_STRENGTH_VALUES: ImpactStrength[] = ["low", "medium", "high"];
const TIME_HORIZON_VALUES: TimeHorizon[] = ["immediate", "near_term", "medium_term", "long_term"];

/**
 * Structural validation for whatever a NewsAnalysisProvider returns. A
 * malformed/hallucinated-shape response must be rejected here rather than
 * persisted -- Phase 3's retry policy hangs off this throwing.
 */
export function validateAiAnalysisResult(value: unknown): AiAnalysisResult {
  if (typeof value !== "object" || value === null) {
    throw new AiAnalysisValidationError("AI analysis response is not an object.");
  }
  const record = value as Record<string, unknown>;

  if (typeof record.summary !== "string" || !record.summary.trim()) {
    throw new AiAnalysisValidationError("AI analysis is missing a non-empty summary.");
  }
  if (!RANGE_IMPACT_VALUES.includes(record.rangeImpact as RangeImpactDirection)) {
    throw new AiAnalysisValidationError(`AI analysis rangeImpact must be one of ${RANGE_IMPACT_VALUES.join(", ")}.`);
  }
  if (!IMPACT_STRENGTH_VALUES.includes(record.impactStrength as ImpactStrength)) {
    throw new AiAnalysisValidationError(`AI analysis impactStrength must be one of ${IMPACT_STRENGTH_VALUES.join(", ")}.`);
  }
  if (!Array.isArray(record.affectedDrivers) || record.affectedDrivers.some((d) => typeof d !== "string")) {
    throw new AiAnalysisValidationError("AI analysis affectedDrivers must be a string array.");
  }
  if (typeof record.rangeAnalysis !== "string" || !record.rangeAnalysis.trim()) {
    throw new AiAnalysisValidationError("AI analysis is missing a non-empty rangeAnalysis.");
  }
  if (!TIME_HORIZON_VALUES.includes(record.timeHorizon as TimeHorizon)) {
    throw new AiAnalysisValidationError(`AI analysis timeHorizon must be one of ${TIME_HORIZON_VALUES.join(", ")}.`);
  }
  if (typeof record.confidence !== "number" || record.confidence < 0 || record.confidence > 1) {
    throw new AiAnalysisValidationError("AI analysis confidence must be a number between 0 and 1.");
  }
  if (typeof record.aiProvider !== "string" || !record.aiProvider.trim()) {
    throw new AiAnalysisValidationError("AI analysis is missing aiProvider.");
  }
  if (typeof record.aiModel !== "string" || !record.aiModel.trim()) {
    throw new AiAnalysisValidationError("AI analysis is missing aiModel.");
  }
  if (typeof record.impactFrameworkVersion !== "string" || !record.impactFrameworkVersion.trim()) {
    throw new AiAnalysisValidationError("AI analysis is missing impactFrameworkVersion.");
  }
  if (typeof record.analyzedAt !== "string" || Number.isNaN(Date.parse(record.analyzedAt))) {
    throw new AiAnalysisValidationError("AI analysis analyzedAt must be a valid ISO timestamp.");
  }

  return record as AiAnalysisResult;
}

/** category is informational context passed to a provider; not part of the validated response contract above. */
export type AnalysisInput = {
  headline: string;
  excerpt: string | null;
  publisher: string;
  categories: NewsCategory[];
  matchedKeywords: string[];
};

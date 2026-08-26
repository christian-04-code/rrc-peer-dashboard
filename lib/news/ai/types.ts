import type { NewsCategory } from "@/lib/news/types";
import type { ImpactDriverKey } from "@/lib/range-impact-framework";
import { NEWS_DRIVER_KEYS } from "@/lib/news/ai/relevant-drivers";

/** Scoped to News's own fixed driver subset (see NEWS_DRIVER_KEYS) -- not the
 * shared framework's generic isImpactDriverKey, which also accepts Macro-only
 * keys (Phase 6) that News's AI provider is never shown and must never
 * validate as if News could have selected them. */
const NEWS_DRIVER_KEY_SET = new Set<string>(NEWS_DRIVER_KEYS);
function isNewsImpactDriverKey(value: string): value is ImpactDriverKey {
  return NEWS_DRIVER_KEY_SET.has(value);
}

export type RangeImpactDirection = "positive" | "negative" | "neutral";
export type ImpactStrength = "low" | "medium" | "high";

/**
 * near_term: days to ~6 months. medium_term: ~6-24 months. long_term:
 * 24+ months. multi_horizon: the story meaningfully affects more than one
 * of the above (e.g. an immediate price move with a multi-year supply
 * consequence) -- use this rather than picking one horizon arbitrarily.
 */
export type TimeHorizon = "near_term" | "medium_term" | "long_term" | "multi_horizon";

/** Bumped whenever the shape/semantics of AiAnalysisResult changes, independent of impact-framework or model versioning. Persisted per-row for audit. */
export const ANALYSIS_SCHEMA_VERSION = "1.0.0";

/**
 * Phase 3 output contract. Deliberately separate from NormalizedArticle: an
 * AiAnalysisResult is model-generated interpretation and must never be
 * stored or rendered merged into the factual article record without the
 * distinction preserved (CLAUDE.md: never merge data of different
 * provenance silently).
 *
 * rangeImpact/impactStrength describe a *potential business/economic*
 * effect on Range Resources -- never a stock recommendation, buy/sell
 * signal, price target, or expected return. confidence reflects confidence
 * in the Range-specific inference itself (how direct the link is, how many
 * assumptions it requires), not confidence that the article is real or
 * relevant.
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
  analysisSchemaVersion: string;
  analyzedAt: string;
};

export class AiAnalysisValidationError extends Error {}

const RANGE_IMPACT_VALUES: RangeImpactDirection[] = ["positive", "negative", "neutral"];
const IMPACT_STRENGTH_VALUES: ImpactStrength[] = ["low", "medium", "high"];
const TIME_HORIZON_VALUES: TimeHorizon[] = ["near_term", "medium_term", "long_term", "multi_horizon"];

/**
 * Phrases the system prompt explicitly forbids (Section 5: no guaranteed
 * outcomes unless the article itself directly reports a realized fact).
 * Enforced here, not just requested in the prompt, so a model that ignores
 * the instruction fails validation and gets retried rather than silently
 * persisting overconfident language.
 */
const GUARANTEED_LANGUAGE_PATTERNS = [
  /\bwill increase\b/i,
  /\bwill decrease\b/i,
  /\bwill rise\b/i,
  /\bwill fall\b/i,
  /\bwill support\b/i,
  /\bwill pressure\b/i,
  /\bdefinitely positive\b/i,
  /\bdefinitely negative\b/i,
  /\bguaranteed to\b/i,
  /\bcertain to\b/i
];

function findGuaranteedLanguage(text: string): string | null {
  for (const pattern of GUARANTEED_LANGUAGE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

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
  if (!Array.isArray(record.affectedDrivers) || record.affectedDrivers.length === 0) {
    throw new AiAnalysisValidationError("AI analysis affectedDrivers must be a non-empty array.");
  }
  for (const driver of record.affectedDrivers) {
    if (typeof driver !== "string" || !isNewsImpactDriverKey(driver)) {
      throw new AiAnalysisValidationError(
        `AI analysis affectedDrivers contains an unrecognized driver "${String(driver)}" -- must be a key from the versioned impact framework, not an invented one.`
      );
    }
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
  if (typeof record.analysisSchemaVersion !== "string" || !record.analysisSchemaVersion.trim()) {
    throw new AiAnalysisValidationError("AI analysis is missing analysisSchemaVersion.");
  }
  if (typeof record.analyzedAt !== "string" || Number.isNaN(Date.parse(record.analyzedAt))) {
    throw new AiAnalysisValidationError("AI analysis analyzedAt must be a valid ISO timestamp.");
  }

  const guaranteedInAnalysis = findGuaranteedLanguage(record.rangeAnalysis);
  if (guaranteedInAnalysis) {
    throw new AiAnalysisValidationError(
      `AI analysis rangeAnalysis uses guaranteed-outcome language ("${guaranteedInAnalysis}") instead of conditional language (may/could/potentially).`
    );
  }
  const guaranteedInSummary = findGuaranteedLanguage(record.summary);
  if (guaranteedInSummary) {
    throw new AiAnalysisValidationError(
      `AI analysis summary uses guaranteed-outcome language ("${guaranteedInSummary}") instead of conditional language.`
    );
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

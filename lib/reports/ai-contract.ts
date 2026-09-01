import type { WeeklyReportPayload } from "@/lib/reports/weekly-report-types";

/**
 * Phase 7A -- the future Weekly Intelligence AI contract (Phase 7A decision
 * #7). This file defines shape and validation only; no AI provider is
 * implemented or called here or anywhere else in Phase 7A. Mirrors the
 * "deterministic engine computes, AI only narrates" boundary already
 * enforced for Macro (lib/market/ai/types.ts's validateMacroSummaryResult,
 * lib/market/macro-risk-engine.ts's comment that "AI does NOT rank these
 * risks"): the future AI receives only this one bounded, already-computed
 * payload per weekly report (target: one AI call per report) and returns
 * only narrative text fields. It may prioritize and synthesize the already-
 * validated evidence it was given; it may never invent a fact, metric,
 * date, ranking, guidance figure, chart, or source.
 */

export type WeeklyIntelligenceAIInput = {
  schemaVersion: string;
  storageWeekEnding: string;
  payload: WeeklyReportPayload;
  /** The previous published report's own bottom-line narrative, for change-detection framing only -- never part of the fingerprinted/cached input, mirrors macro-summary-service.ts's priorSummary/priorContext pattern. Null until at least one prior report has been published. */
  previousReportContext: { storageWeekEnding: string; bottomLine: string } | null;
  /** Explicit allowlist of evidence item ids the AI may reference via selectedEvidenceIds -- so the AI can never select or imply evidence outside what was actually supplied this run. */
  availableEvidenceIds: string[];
};

export type WeeklyIntelligenceAIOutput = {
  schemaVersion: string;
  aiProvider: string;
  aiModel: string;
  generatedAt: string;
  /** ~500-word target executive assessment for report page 1 (Phase 7A decision #8). */
  executiveAssessment: string;
  biggestRisk: string;
  biggestOpportunity: string;
  whatChanged: string;
  managementWatchItems: string[];
  bottomLine: string;
  /** Must be a subset of the input's availableEvidenceIds -- enforced by validateWeeklyIntelligenceAIOutput below, never left to the provider's own judgment about what "exists". */
  selectedEvidenceIds: string[];
};

export const WEEKLY_INTELLIGENCE_AI_SCHEMA_VERSION = "1.0.0";

export class WeeklyIntelligenceAIValidationError extends Error {}

// Generous floor/ceiling around the ~500-word target (Phase 7A decision
// #8) -- wide enough that a genuinely quiet or genuinely eventful week
// doesn't get rejected for being shorter/longer than an arbitrary point
// estimate, narrow enough to keep the future PDF's 5-page hard maximum
// (Phase 7 product brief) honest even before the renderer exists.
const MIN_ASSESSMENT_WORDS = 250;
const MAX_ASSESSMENT_WORDS = 900;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const REQUIRED_STRING_FIELDS: (keyof WeeklyIntelligenceAIOutput)[] = [
  "schemaVersion",
  "aiProvider",
  "aiModel",
  "generatedAt",
  "executiveAssessment",
  "biggestRisk",
  "biggestOpportunity",
  "whatChanged",
  "bottomLine"
];

/**
 * Pure structural/content validation of a future AI response against this
 * contract -- calls no AI provider itself. Intended to be reused by Phase
 * 7B's real provider integration the same way
 * lib/market/ai/types.ts's validateMacroSummaryResult is reused by the
 * Macro AI provider: reject and retry a malformed or out-of-bounds response
 * before it is ever persisted, rather than trusting the model's raw output.
 */
export function validateWeeklyIntelligenceAIOutput(value: unknown, input: WeeklyIntelligenceAIInput): WeeklyIntelligenceAIOutput {
  if (typeof value !== "object" || value === null) {
    throw new WeeklyIntelligenceAIValidationError("Weekly Intelligence AI response is not an object.");
  }
  const record = value as Record<string, unknown>;

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof record[field] !== "string" || !(record[field] as string).trim()) {
      throw new WeeklyIntelligenceAIValidationError(`Weekly Intelligence AI response is missing non-empty "${field}".`);
    }
  }

  if (Number.isNaN(Date.parse(record.generatedAt as string))) {
    throw new WeeklyIntelligenceAIValidationError("Weekly Intelligence AI response generatedAt must be a valid ISO timestamp.");
  }

  const words = wordCount(record.executiveAssessment as string);
  if (words < MIN_ASSESSMENT_WORDS || words > MAX_ASSESSMENT_WORDS) {
    throw new WeeklyIntelligenceAIValidationError(
      `Weekly Intelligence AI executiveAssessment is ${words} words -- outside the ${MIN_ASSESSMENT_WORDS}-${MAX_ASSESSMENT_WORDS} word contract range.`
    );
  }

  if (
    !Array.isArray(record.managementWatchItems) ||
    record.managementWatchItems.length === 0 ||
    record.managementWatchItems.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new WeeklyIntelligenceAIValidationError("Weekly Intelligence AI response managementWatchItems must be a non-empty array of non-empty strings.");
  }

  if (!Array.isArray(record.selectedEvidenceIds) || record.selectedEvidenceIds.some((id) => typeof id !== "string")) {
    throw new WeeklyIntelligenceAIValidationError("Weekly Intelligence AI response selectedEvidenceIds must be a string array.");
  }
  const allowed = new Set(input.availableEvidenceIds);
  const invalidIds = (record.selectedEvidenceIds as string[]).filter((id) => !allowed.has(id));
  if (invalidIds.length > 0) {
    throw new WeeklyIntelligenceAIValidationError(
      `Weekly Intelligence AI response selectedEvidenceIds references evidence not supplied in the input: ${invalidIds.join(", ")}.`
    );
  }

  return record as WeeklyIntelligenceAIOutput;
}

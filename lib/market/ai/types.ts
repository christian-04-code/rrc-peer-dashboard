import type { MacroRiskPayload } from "@/lib/market/macro-risk-engine";

/**
 * Macro's own AI summary contract -- deliberately separate from
 * lib/news/ai/types.ts (Phase 6A's boundary: only the Range driver taxonomy
 * is shared between News and Macro; each keeps its own AI validation code).
 * The AI here explains signals the deterministic engine already ranked; it
 * never re-ranks, re-scores, or invents a driver.
 */
export type MacroSummaryResult = {
  summary: string;
  aiProvider: string;
  aiModel: string;
  schemaVersion: string;
  generatedAt: string;
};

export const MACRO_SUMMARY_SCHEMA_VERSION = "1.0.0";

export class MacroSummaryValidationError extends Error {}

/**
 * Phrases forbidden by Section 14: no guaranteed outcomes, and specifically
 * no stock-direction certainty ("will rise/fall/outperform"), on top of the
 * same general guaranteed-language forms lib/news/ai/types.ts already
 * enforces for its own summaries. Kept as Macro's own copy rather than an
 * import from lib/news/ai/ -- see the file-level note above.
 */
const GUARANTEED_LANGUAGE_PATTERNS = [
  /\bwill increase\b/i,
  /\bwill decrease\b/i,
  /\bwill rise\b/i,
  /\bwill fall\b/i,
  /\bwill support\b/i,
  /\bwill pressure\b/i,
  /\bwill outperform\b/i,
  /\bwill underperform\b/i,
  /\bstock will\b/i,
  /\bshares will\b/i,
  /\bdefinitely positive\b/i,
  /\bdefinitely negative\b/i,
  /\bguaranteed to\b/i,
  /\bcertain to\b/i,
  /\bis certain\b/i
];

function findGuaranteedLanguage(text: string): string | null {
  for (const pattern of GUARANTEED_LANGUAGE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/** Exported so the AI provider and its tests can both check a draft summary before it's ever persisted -- a malformed/overconfident response is rejected and retried, never silently saved. */
export function findGuaranteedLanguageInMacroSummary(text: string): string | null {
  return findGuaranteedLanguage(text);
}

const MIN_SUMMARY_WORDS = 15;
const MAX_SUMMARY_WORDS = 220;

export function validateMacroSummaryResult(value: unknown): MacroSummaryResult {
  if (typeof value !== "object" || value === null) {
    throw new MacroSummaryValidationError("Macro AI summary response is not an object.");
  }
  const record = value as Record<string, unknown>;

  if (typeof record.summary !== "string" || !record.summary.trim()) {
    throw new MacroSummaryValidationError("Macro AI summary is missing non-empty summary text.");
  }
  const wordCount = record.summary.trim().split(/\s+/).length;
  if (wordCount < MIN_SUMMARY_WORDS) {
    throw new MacroSummaryValidationError(`Macro AI summary is too short (${wordCount} words) to be a useful executive summary.`);
  }
  if (wordCount > MAX_SUMMARY_WORDS) {
    throw new MacroSummaryValidationError(`Macro AI summary is too long (${wordCount} words) -- this is meant to be a concise 3-6 sentence executive summary, not an article.`);
  }
  const guaranteed = findGuaranteedLanguage(record.summary);
  if (guaranteed) {
    throw new MacroSummaryValidationError(
      `Macro AI summary uses guaranteed-outcome language ("${guaranteed}") instead of conditional language (may/could/potentially/suggests).`
    );
  }
  if (typeof record.aiProvider !== "string" || !record.aiProvider.trim()) {
    throw new MacroSummaryValidationError("Macro AI summary is missing aiProvider.");
  }
  if (typeof record.aiModel !== "string" || !record.aiModel.trim()) {
    throw new MacroSummaryValidationError("Macro AI summary is missing aiModel.");
  }
  if (typeof record.schemaVersion !== "string" || !record.schemaVersion.trim()) {
    throw new MacroSummaryValidationError("Macro AI summary is missing schemaVersion.");
  }
  if (typeof record.generatedAt !== "string" || Number.isNaN(Date.parse(record.generatedAt))) {
    throw new MacroSummaryValidationError("Macro AI summary generatedAt must be a valid ISO timestamp.");
  }

  return record as MacroSummaryResult;
}

export type { MacroRiskPayload };

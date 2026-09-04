import type { Pool } from "pg";
import { withBoundedRetry, DEFAULT_ANALYSIS_RETRY_CONFIG } from "@/lib/news/ai/retry";
import type { MacroSummaryProvider } from "@/lib/market/ai/provider";
import { MacroSummaryProviderError } from "@/lib/market/ai/provider";
import { MacroSummaryValidationError } from "@/lib/market/ai/types";
import type { MacroRiskPayload } from "@/lib/market/macro-risk-engine";
import {
  getCachedMacroSummary,
  getPreviousMacroSummary,
  saveMacroSummary,
  type MacroRiskSummaryRecord
} from "@/lib/market/persistence/summary-repo";

/**
 * withBoundedRetry is imported directly from lib/news/ai/retry.ts rather than
 * duplicated -- it's a pure, domain-neutral async-retry helper with zero News
 * coupling (confirmed by reading it: no News types, no News imports). The
 * Phase 6A boundary ("News keeps its own AI code separate from Macro's")
 * applies to actual News-domain logic (validation, prompts, driver
 * selection) -- not to a generic utility like this one.
 */

export type GenerateMacroSummaryResult = {
  record: MacroRiskSummaryRecord;
  cacheHit: boolean;
};

/** Known, safe-to-surface error types get their real (truncated) message; anything else is reduced to its error name only. Mirrors lib/news/pipeline/analyze.ts's safeErrorMessage. */
function safeErrorMessage(error: unknown): string {
  if (error instanceof MacroSummaryValidationError || error instanceof MacroSummaryProviderError) {
    return error.message.slice(0, 300);
  }
  if (error instanceof Error) return `Macro summary generation failed (${error.name}).`;
  return "Macro summary generation failed (unknown error).";
}

/**
 * The one place that decides whether to call the AI provider (Section
 * 16/18): looks up the cache by fingerprint first, and only calls the
 * provider -- with bounded retry -- when nothing is cached for this exact
 * deterministic payload. Only ever called from the scheduled cron route
 * (app/api/cron/macro/route.ts), never from a browser-facing route --
 * callers here own that guarantee, this function doesn't enforce it itself.
 */
export async function generateMacroSummaryIfNeeded(
  pool: Pool,
  provider: MacroSummaryProvider,
  payload: MacroRiskPayload,
  fingerprint: string
): Promise<GenerateMacroSummaryResult> {
  const cached = await getCachedMacroSummary(pool, fingerprint);
  if (cached) {
    return { record: cached, cacheHit: true };
  }

  const previous = await getPreviousMacroSummary(pool, fingerprint);
  const priorContext = previous ? { generatedAt: previous.generatedAt, summary: previous.summary } : null;

  const result = await withBoundedRetry(() => provider.summarize(payload, priorContext), DEFAULT_ANALYSIS_RETRY_CONFIG);

  const record: MacroRiskSummaryRecord = {
    inputFingerprint: fingerprint,
    summary: result.summary,
    riskSignals: payload,
    aiProvider: result.aiProvider,
    aiModel: result.aiModel,
    schemaVersion: result.schemaVersion,
    generatedAt: result.generatedAt
  };

  // ON CONFLICT DO NOTHING inside saveMacroSummary means a race against a
  // concurrent duplicate cron delivery never overwrites an already-saved
  // summary for this fingerprint -- re-read so the caller always gets back
  // whichever version actually persisted first.
  const { inserted } = await saveMacroSummary(pool, record);
  if (inserted) return { record, cacheHit: false };

  const persisted = await getCachedMacroSummary(pool, fingerprint);
  return { record: persisted ?? record, cacheHit: true };
}

export { safeErrorMessage as macroSummarySafeErrorMessage };

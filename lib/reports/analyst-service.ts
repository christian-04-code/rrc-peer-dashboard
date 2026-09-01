import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { withBoundedRetry, DEFAULT_ANALYSIS_RETRY_CONFIG } from "@/lib/news/ai/retry";
import type { WeeklyAnalystProvider } from "@/lib/reports/ai/provider";
import { WeeklyAnalystProviderError } from "@/lib/reports/ai/provider";
import { WeeklyAnalystValidationError, type WeeklyAnalystInput } from "@/lib/reports/ai-contract";
import { WEEKLY_ANALYST_PROMPT_VERSION } from "@/lib/reports/ai/model-config";
import {
  createPendingAnalysis,
  getActiveAnalysis,
  getReadyAnalysis,
  markAnalysisFailed,
  markAnalysisReady,
  type WeeklyAnalysisRecord
} from "@/lib/reports/persistence/analysis-repo";

/**
 * Phase 7C's one entry point for generating (or reusing) a weekly analyst
 * assessment -- mirrors lib/market/macro-summary-service.ts's
 * generateMacroSummaryIfNeeded exactly in structure: look up the cache by
 * fingerprint first, only call the provider (with bounded retry) when
 * nothing is cached, and let the DB's own uniqueness constraints (not this
 * function) be the final word on concurrent-caller safety.
 *
 * Not called from any browser-facing route -- intended for a future
 * Phase 7F scheduled orchestration (mirroring app/api/cron/macro/route.ts's
 * relationship to runMacroDailyOrchestration()), which does not exist yet.
 * This function itself never decides *when* to run; it only decides
 * *whether AI needs to be called* for a given already-selected input.
 */

/**
 * `withBoundedRetry` is imported directly from lib/news/ai/retry.ts rather
 * than duplicated -- confirmed (same reasoning macro-summary-service.ts
 * already recorded) to be a pure, domain-neutral async-retry helper with
 * zero News coupling.
 */

/**
 * Derived from the frozen snapshot's own input_fingerprint (Phase 7B) +
 * the AI schema version + prompt version + model identifier -- the four
 * components the Phase 7C brief specifies. A flat delimited join (not the
 * canonicalize-then-hash approach fingerprint.ts uses for the richer,
 * nested evidence payload) is sufficient and simpler here: all four inputs
 * are already-flat, already-stable strings with no ordering ambiguity.
 * Changing any one of the four -- a new snapshot, a schema bump, a prompt
 * rewording, or a model change -- produces a different fingerprint and
 * therefore a fresh analysis; an unchanged snapshot with an unchanged
 * prompt/schema/model always reproduces the identical fingerprint.
 */
export function computeWeeklyAnalystFingerprint(input: { snapshotFingerprint: string; schemaVersion: string; promptVersion: string; model: string }): string {
  return createHash("sha256").update(`${input.snapshotFingerprint}|${input.schemaVersion}|${input.promptVersion}|${input.model}`).digest("hex");
}

/** Known, safe-to-surface error types get their real (truncated) message; anything else is reduced to its error name only. Mirrors lib/market/macro-summary-service.ts's safeErrorMessage. */
function safeErrorMessage(error: unknown): string {
  if (error instanceof WeeklyAnalystValidationError || error instanceof WeeklyAnalystProviderError) {
    return error.message.slice(0, 300);
  }
  if (error instanceof Error) return `Weekly analyst assessment generation failed (${error.name}).`;
  return "Weekly analyst assessment generation failed (unknown error).";
}

export type GenerateWeeklyAnalysisResult =
  | { status: "cache_hit"; record: WeeklyAnalysisRecord }
  | { status: "in_progress"; record: WeeklyAnalysisRecord }
  | { status: "generated"; record: WeeklyAnalysisRecord }
  | { status: "failed"; record: WeeklyAnalysisRecord; reason: string };

export type GenerateWeeklyAnalysisContext = {
  snapshotId: string;
  snapshotFingerprint: string;
  schemaVersion: string;
  model: string;
  promptVersion?: string;
};

export async function generateWeeklyAnalysisIfNeeded(
  pool: Pool,
  provider: WeeklyAnalystProvider,
  input: WeeklyAnalystInput,
  context: GenerateWeeklyAnalysisContext
): Promise<GenerateWeeklyAnalysisResult> {
  const promptVersion = context.promptVersion ?? WEEKLY_ANALYST_PROMPT_VERSION;
  const analysisFingerprint = computeWeeklyAnalystFingerprint({
    snapshotFingerprint: context.snapshotFingerprint,
    schemaVersion: context.schemaVersion,
    promptVersion,
    model: context.model
  });

  const cached = await getReadyAnalysis(pool, analysisFingerprint);
  if (cached) return { status: "cache_hit", record: cached };

  const active = await getActiveAnalysis(pool, analysisFingerprint);
  if (active) return { status: "in_progress", record: active };

  const pending = await createPendingAnalysis(pool, { snapshotId: context.snapshotId, analysisFingerprint, schemaVersion: context.schemaVersion, promptVersion });
  if (pending.status !== "pending") {
    // createPendingAnalysis returned an existing ready/active row from a
    // concurrent caller that won the race between the checks above and this call.
    return pending.status === "ready" ? { status: "cache_hit", record: pending } : { status: "in_progress", record: pending };
  }

  try {
    const assessment = await withBoundedRetry(() => provider.analyze(input), DEFAULT_ANALYSIS_RETRY_CONFIG);
    const ready = await markAnalysisReady(pool, pending.id, { aiProvider: assessment.aiProvider, aiModel: assessment.aiModel, assessment });
    if (!ready) {
      // Lost a race to mark this row ready -- another caller's attempt already
      // resolved this fingerprint first. Re-read whichever version actually persisted.
      const persisted = await getReadyAnalysis(pool, analysisFingerprint);
      return persisted ? { status: "cache_hit", record: persisted } : { status: "in_progress", record: pending };
    }
    return { status: "generated", record: ready };
  } catch (error) {
    const reason = safeErrorMessage(error);
    const failed = await markAnalysisFailed(pool, pending.id, reason);
    return { status: "failed", record: failed ?? pending, reason };
  }
}

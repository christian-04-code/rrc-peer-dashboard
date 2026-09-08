import type { Pool } from "pg";
import { getPool, isDatabaseConfigured } from "@/lib/persistence/db";
import { runNewsPipeline, type PipelineRunResult } from "@/lib/news/pipeline/runner";
import type { NewsSourceAdapter } from "@/lib/news/sources";
import { analyzeEligibleArticles } from "@/lib/news/pipeline/analyze";
import { AnthropicNewsAnalysisProvider } from "@/lib/news/ai/anthropic-provider";
import type { NewsAnalysisProvider } from "@/lib/news/ai/provider";
import { PIPELINE_CONFIG } from "@/lib/news/pipeline/config";

/**
 * A single fixed advisory-lock key for the daily orchestration. Vercel's own
 * cron docs warn that delivery can occasionally invoke the same scheduled
 * run more than once concurrently -- this lock is the cheap Postgres-native
 * guard against two overlapping invocations both selecting (and paying to
 * analyze) the same "eligible" article before either write lands. No new
 * infrastructure: it reuses the same Postgres connection the pipeline
 * already requires.
 */
const ORCHESTRATION_LOCK_QUERY = `SELECT pg_try_advisory_lock(hashtext('rrc_news_daily_orchestration')::bigint) AS locked`;
const ORCHESTRATION_UNLOCK_QUERY = `SELECT pg_advisory_unlock(hashtext('rrc_news_daily_orchestration')::bigint) AS unlocked`;

export type DailyOrchestrationResult =
  | (PipelineRunResult & { aiSkippedReason: string | null; concurrentRunSkipped: false })
  | { concurrentRunSkipped: true; reason: string };

/** Known, safe-to-surface error types get a bounded real message; anything else is reduced to its error name only, since an unexpected error's message is not guaranteed to be free of connection/request detail. */
function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: analysis stage failed.`;
  return "analysis stage failed (unknown error).";
}

async function tryAcquireLock(pool: Pool): Promise<boolean> {
  try {
    const result = await pool.query(ORCHESTRATION_LOCK_QUERY);
    return result.rows[0]?.locked === true;
  } catch {
    // If the lock query itself fails (connectivity), treat as "could not
    // safely coordinate" rather than silently racing -- the pipeline run
    // below will surface the same connectivity problem on its own queries.
    return false;
  }
}

async function releaseLock(pool: Pool): Promise<void> {
  await pool.query(ORCHESTRATION_UNLOCK_QUERY).catch(() => undefined);
}

/**
 * The one shared orchestration path for a full daily run: deterministic
 * collection/dedupe/relevance/persistence (runNewsPipeline), followed by
 * bounded AI analysis of exactly the articles that run retained
 * (analyzeEligibleArticles, current-run-scoped). Both stages are the same
 * domain functions the manual /api/cron/news/analyze validation endpoint
 * uses -- this function does not reimplement either one, only sequences
 * them and applies the production-scale cap instead of the 5-article
 * manual-validation cap.
 */
export async function runDailyNewsOrchestration(
  options: { provider?: NewsAnalysisProvider; adapters?: NewsSourceAdapter[] } = {}
): Promise<DailyOrchestrationResult> {
  const pool = isDatabaseConfigured() ? getPool() : null;

  let lockAcquired = false;
  if (pool) {
    lockAcquired = await tryAcquireLock(pool);
    if (!lockAcquired) {
      return { concurrentRunSkipped: true, reason: "Another news orchestration run is already in progress; skipped to avoid duplicate AI analysis." };
    }
  }

  try {
    const pipeline = await runNewsPipeline({ adapters: options.adapters });

    let aiAnalysesAttempted = 0;
    let aiAnalysesCompleted = 0;
    let aiAnalysesFailed = 0;
    let aiSkippedReason: string | null = null;

    if (!pool) {
      aiSkippedReason = "Database not configured -- AI analysis skipped; the deterministic pipeline still ran.";
    } else if (!process.env.ANTHROPIC_API_KEY) {
      aiSkippedReason = "ANTHROPIC_API_KEY not configured -- AI analysis skipped; the deterministic pipeline still ran.";
    } else if (pipeline.runId) {
      try {
        const provider = options.provider ?? new AnthropicNewsAnalysisProvider();
        const analysis = await analyzeEligibleArticles(pool, provider, {
          maxArticles: PIPELINE_CONFIG.maxAiAnalysesPerRun,
          pipelineRunId: pipeline.runId,
          // Unlike the manual validation endpoint, the daily run must also
          // pick up anything a previous run left in 'retained' -- see
          // AnalyzeOptions.scopeArticlesToRun in lib/news/pipeline/analyze.ts.
          scopeArticlesToRun: false
        });
        aiAnalysesAttempted = analysis.attempted;
        aiAnalysesCompleted = analysis.completed;
        aiAnalysesFailed = analysis.failed;
      } catch (error) {
        aiSkippedReason = `AI analysis stage did not complete: ${safeErrorMessage(error)}`;
      }
    }

    return {
      ...pipeline,
      aiAnalysesAttempted,
      aiAnalysesCompleted,
      aiAnalysesFailed,
      aiSkippedReason,
      concurrentRunSkipped: false
    };
  } finally {
    if (pool && lockAcquired) {
      await releaseLock(pool);
    }
  }
}

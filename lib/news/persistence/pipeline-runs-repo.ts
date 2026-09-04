import type { Pool } from "pg";
import type { PipelineRunStatus, PipelineRunSummary } from "@/lib/news/types";

export async function createPipelineRun(pool: Pool, startedAt: string): Promise<string> {
  const runDate = startedAt.slice(0, 10);
  const result = await pool.query(
    `INSERT INTO pipeline_runs (run_date, started_at, status) VALUES ($1, $2, 'running') RETURNING id`,
    [runDate, startedAt]
  );
  return result.rows[0].id as string;
}

export async function completePipelineRun(
  pool: Pool,
  runId: string,
  summary: Omit<PipelineRunSummary, "runId" | "runDate" | "startedAt" | "durationMs">
): Promise<void> {
  await pool.query(
    `UPDATE pipeline_runs SET
      completed_at = $2,
      status = $3,
      sources_attempted = $4,
      sources_successful = $5,
      source_failures = $6,
      articles_discovered = $7,
      duplicates_removed = $8,
      articles_rejected = $9,
      articles_retained = $10,
      ai_analyses_attempted = $11,
      ai_analyses_completed = $12,
      ai_analyses_failed = $13,
      errors = $14
    WHERE id = $1`,
    [
      runId,
      summary.completedAt,
      summary.status,
      summary.sourcesAttempted,
      summary.sourcesSuccessful,
      JSON.stringify(summary.sourceFailures),
      summary.articlesDiscovered,
      summary.duplicatesRemoved,
      summary.articlesRejected,
      summary.articlesRetained,
      summary.aiAnalysesAttempted,
      summary.aiAnalysesCompleted,
      // Defaults to 0 for any pre-Phase-5 caller that doesn't pass this
      // field -- additive, never a breaking change to completePipelineRun's contract.
      summary.aiAnalysesFailed ?? 0,
      JSON.stringify(summary.errors)
    ]
  );
}

/** Phase 3: update AI accounting after the bounded analysis step finishes. Phase 5 added the failed count alongside attempted/completed. */
export async function recordPipelineRunAiCounts(
  pool: Pool,
  runId: string,
  attempted: number,
  completed: number,
  failed: number = 0
): Promise<void> {
  await pool.query(
    `UPDATE pipeline_runs SET ai_analyses_attempted = $2, ai_analyses_completed = $3, ai_analyses_failed = $4 WHERE id = $1`,
    [runId, attempted, completed, failed]
  );
}

export async function markPipelineRunFailed(pool: Pool, runId: string, status: PipelineRunStatus, error: string): Promise<void> {
  await pool.query(
    `UPDATE pipeline_runs SET completed_at = now(), status = $2, errors = errors || $3::jsonb WHERE id = $1`,
    [runId, status, JSON.stringify([error])]
  );
}

export async function getPipelineRun(pool: Pool, runId: string): Promise<Record<string, unknown> | null> {
  const result = await pool.query(`SELECT * FROM pipeline_runs WHERE id = $1`, [runId]);
  return result.rows[0] ?? null;
}

/** Most recent run, for the News tab's Daily Intelligence header. Prefers a completed run so the header doesn't show a still-in-progress row as "the" status; falls back to the most recent run of any status if none has completed yet. */
export async function getLatestPipelineRun(pool: Pool): Promise<Record<string, unknown> | null> {
  const completed = await pool.query(
    `SELECT * FROM pipeline_runs WHERE status IN ('completed', 'completed_with_errors') ORDER BY started_at DESC LIMIT 1`
  );
  if (completed.rows[0]) return completed.rows[0];
  const anyRun = await pool.query(`SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 1`);
  return anyRun.rows[0] ?? null;
}

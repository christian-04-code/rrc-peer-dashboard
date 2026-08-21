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
      errors = $13
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
      JSON.stringify(summary.errors)
    ]
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

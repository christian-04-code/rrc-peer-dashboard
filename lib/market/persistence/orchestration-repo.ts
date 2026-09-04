import type { Pool } from "pg";

/**
 * Phase 6E "Last Updated" source -- see schema.sql's comment on
 * macro_orchestration_runs for why this is its own table rather than a
 * reuse of macro_steo_snapshots.updated_at (that column also advances on
 * ordinary Macro-tab traffic via Phase 6C's opportunistic per-request STEO
 * capture, so it cannot distinguish a real cron run from a page view).
 */
export type OrchestrationRunRecord = {
  steoRefreshed: number;
  steoFailed: number;
  aiSummaryGenerated: boolean;
};

/** Called once, at the end of a successful /api/cron/macro run -- never from a browser-facing route, never on a failed/skipped run. */
export async function recordOrchestrationRun(pool: Pool, record: OrchestrationRunRecord): Promise<void> {
  await pool.query(
    `INSERT INTO macro_orchestration_runs (steo_refreshed, steo_failed, ai_summary_generated) VALUES ($1, $2, $3)`,
    [record.steoRefreshed, record.steoFailed, record.aiSummaryGenerated]
  );
}

/** Null before the very first successful cron run -- callers must show an honest "not yet available" state, never fall back to the browser's own clock. */
export async function getLatestOrchestrationTimestamp(pool: Pool): Promise<string | null> {
  const result = await pool.query(`SELECT MAX(completed_at) AS latest FROM macro_orchestration_runs`);
  const latest = result.rows[0]?.latest as Date | string | null | undefined;
  if (!latest) return null;
  return latest instanceof Date ? latest.toISOString() : latest;
}

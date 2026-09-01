import type { Pool } from "pg";
import type { WeeklyAnalystAssessment } from "@/lib/reports/ai-contract";

/**
 * Persistence for weekly_report_analyses (Phase 7C). Same atomic
 * compare-and-swap convention lib/reports/persistence/report-repo.ts
 * established for weekly_report_snapshots: every lifecycle transition is
 * an `UPDATE ... WHERE id = $1 AND status = $expected`, and a transition
 * function returns `null` (never throws) when the row wasn't in the
 * expected state. This file never decides *when* to generate an analysis
 * or what it should say -- see lib/reports/analyst-service.ts for that.
 */

export type WeeklyAnalysisStatus = "pending" | "ready" | "failed";

export type WeeklyAnalysisRecord = {
  id: string;
  snapshotId: string;
  analysisFingerprint: string;
  status: WeeklyAnalysisStatus;
  errorMessage: string | null;
  schemaVersion: string;
  promptVersion: string;
  aiProvider: string | null;
  aiModel: string | null;
  assessment: WeeklyAnalystAssessment | null;
  attemptedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type WeeklyAnalysisRow = {
  id: string;
  snapshot_id: string;
  analysis_fingerprint: string;
  status: WeeklyAnalysisStatus;
  error_message: string | null;
  schema_version: string;
  prompt_version: string;
  ai_provider: string | null;
  ai_model: string | null;
  assessment: WeeklyAnalystAssessment | null;
  attempted_at: Date | string;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const SELECT_COLUMNS = `
  id, snapshot_id, analysis_fingerprint, status, error_message, schema_version,
  prompt_version, ai_provider, ai_model, assessment, attempted_at, completed_at,
  created_at, updated_at
`;

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: WeeklyAnalysisRow): WeeklyAnalysisRecord {
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    analysisFingerprint: row.analysis_fingerprint,
    status: row.status,
    errorMessage: row.error_message,
    schemaVersion: row.schema_version,
    promptVersion: row.prompt_version,
    aiProvider: row.ai_provider,
    aiModel: row.ai_model,
    assessment: row.assessment,
    attemptedAt: toIso(row.attempted_at) as string,
    completedAt: toIso(row.completed_at),
    createdAt: toIso(row.created_at) as string,
    updatedAt: toIso(row.updated_at) as string
  };
}

const UNIQUE_VIOLATION = "23505";
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION;
}

export type CreatePendingAnalysisInput = {
  snapshotId: string;
  analysisFingerprint: string;
  schemaVersion: string;
  promptVersion: string;
};

/**
 * Creates a new "pending" attempt for an analysis fingerprint. Idempotent:
 * if an active (pending) attempt for this exact fingerprint already
 * exists -- a concurrent or duplicate caller -- this returns that existing
 * row rather than erroring or creating a second concurrent attempt. Does
 * NOT check for an existing "ready" row itself -- callers (analyst-service.ts)
 * check the cache first, before ever reaching this function, so this stays
 * a single-purpose primitive.
 */
export async function createPendingAnalysis(pool: Pool, input: CreatePendingAnalysisInput): Promise<WeeklyAnalysisRecord> {
  try {
    const result = await pool.query(
      `INSERT INTO weekly_report_analyses (snapshot_id, analysis_fingerprint, schema_version, prompt_version, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING ${SELECT_COLUMNS}`,
      [input.snapshotId, input.analysisFingerprint, input.schemaVersion, input.promptVersion]
    );
    return mapRow(result.rows[0] as WeeklyAnalysisRow);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getActiveAnalysis(pool, input.analysisFingerprint);
    if (existing) return existing;
    const ready = await getReadyAnalysis(pool, input.analysisFingerprint);
    if (ready) return ready;
    throw error; // genuinely unexpected: the unique violation fired but no active/ready row is now visible
  }
}

/** The pending row for a given fingerprint, if any -- at most one can exist per weekly_report_analyses_active_fingerprint_key. */
export async function getActiveAnalysis(pool: Pool, analysisFingerprint: string): Promise<WeeklyAnalysisRecord | null> {
  const result = await pool.query(`SELECT ${SELECT_COLUMNS} FROM weekly_report_analyses WHERE analysis_fingerprint = $1 AND status = 'pending'`, [analysisFingerprint]);
  const row = result.rows[0] as WeeklyAnalysisRow | undefined;
  return row ? mapRow(row) : null;
}

/** The one cache lookup analyst-service.ts is built around: a successful analysis for this exact fingerprint, if one has ever been generated. At most one can exist per weekly_report_analyses_ready_fingerprint_key. */
export async function getReadyAnalysis(pool: Pool, analysisFingerprint: string): Promise<WeeklyAnalysisRecord | null> {
  const result = await pool.query(`SELECT ${SELECT_COLUMNS} FROM weekly_report_analyses WHERE analysis_fingerprint = $1 AND status = 'ready'`, [analysisFingerprint]);
  const row = result.rows[0] as WeeklyAnalysisRow | undefined;
  return row ? mapRow(row) : null;
}

/** Most recent attempt (any status) for a given snapshot, newest first -- a convenience lookup for a future caller that wants "the latest analysis attempt for this report," not part of the cache-hit path itself. */
export async function getLatestAnalysisForSnapshot(pool: Pool, snapshotId: string): Promise<WeeklyAnalysisRecord | null> {
  const result = await pool.query(`SELECT ${SELECT_COLUMNS} FROM weekly_report_analyses WHERE snapshot_id = $1 ORDER BY created_at DESC LIMIT 1`, [snapshotId]);
  const row = result.rows[0] as WeeklyAnalysisRow | undefined;
  return row ? mapRow(row) : null;
}

export type MarkAnalysisReadyInput = {
  aiProvider: string;
  aiModel: string;
  assessment: WeeklyAnalystAssessment;
};

/** Atomic pending -> ready, and the one place `assessment`/`ai_provider`/`ai_model` are ever written. Returns null (does not throw) if the row is missing or was no longer "pending". */
export async function markAnalysisReady(pool: Pool, id: string, input: MarkAnalysisReadyInput): Promise<WeeklyAnalysisRecord | null> {
  const result = await pool.query(
    `UPDATE weekly_report_analyses SET
       status = 'ready',
       ai_provider = $2,
       ai_model = $3,
       assessment = $4,
       completed_at = now(),
       updated_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING ${SELECT_COLUMNS}`,
    [id, input.aiProvider, input.aiModel, JSON.stringify(input.assessment)]
  );
  const row = result.rows[0] as WeeklyAnalysisRow | undefined;
  return row ? mapRow(row) : null;
}

/** Atomic pending -> failed. A ready row can never be marked failed -- there is deliberately no WHERE clause branch that permits it, so this can never overwrite a valid prior successful analysis. */
export async function markAnalysisFailed(pool: Pool, id: string, errorMessage: string): Promise<WeeklyAnalysisRecord | null> {
  const result = await pool.query(
    `UPDATE weekly_report_analyses SET status = 'failed', error_message = $2, completed_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING ${SELECT_COLUMNS}`,
    [id, errorMessage]
  );
  const row = result.rows[0] as WeeklyAnalysisRow | undefined;
  return row ? mapRow(row) : null;
}

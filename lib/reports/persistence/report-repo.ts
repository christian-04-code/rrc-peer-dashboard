import type { Pool } from "pg";
import type {
  SourceFreshnessManifest,
  StorageWeekEnding,
  WeeklyReportPayload,
  WeeklyReportSnapshotRecord,
  WeeklyReportStatus
} from "@/lib/reports/weekly-report-types";

/**
 * Persistence for weekly_report_snapshots (Phase 7A). Every lifecycle
 * transition below is an atomic `UPDATE ... WHERE id = $1 AND status =
 * $expected` -- a Compare-And-Swap on the row's own status column, the same
 * "the DB decides who wins a race, not the application" principle
 * lib/market/persistence/summary-repo.ts's `ON CONFLICT DO NOTHING` uses for
 * Macro's cache. A transition function returns `null` (never throws) when
 * the row wasn't in the expected state -- callers re-read if they need to
 * know why, rather than this file guessing at a caller's intent.
 *
 * This file never decides *when* to transition a report or what its
 * content should be -- that is Phase 7B's snapshot builder and Phase 7B/7D's
 * publish pipeline. It only provides the durable, race-safe primitives.
 */

type WeeklyReportSnapshotRow = {
  id: string;
  storage_week_ending: string | Date;
  status: WeeklyReportStatus;
  schema_version: string;
  failed_reason: string | null;
  data_cutoff_at: Date | string | null;
  payload: WeeklyReportPayload | null;
  input_fingerprint: string | null;
  source_manifest: SourceFreshnessManifest | null;
  readiness: unknown;
  previous_snapshot_id: string | null;
  artifact_key: string | null;
  artifact_checksum: string | null;
  artifact_size_bytes: string | number | null; // BIGINT comes back as string from node-pg
  artifact_content_type: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  published_at: Date | string | null;
};

const SELECT_COLUMNS = `
  id, storage_week_ending, status, schema_version, failed_reason,
  data_cutoff_at, payload, input_fingerprint, source_manifest, readiness,
  previous_snapshot_id, artifact_key, artifact_checksum, artifact_size_bytes,
  artifact_content_type, created_at, updated_at, published_at
`;

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

/** storage_week_ending is a Postgres DATE -- node-pg returns it as a Date already normalized to UTC midnight; slice to YYYY-MM-DD rather than a full ISO timestamp so it stays a StorageWeekEnding, not a datetime. */
function toDateOnly(value: string | Date): StorageWeekEnding {
  const iso = value instanceof Date ? value.toISOString() : value;
  return iso.slice(0, 10);
}

function mapRow(row: WeeklyReportSnapshotRow): WeeklyReportSnapshotRecord {
  return {
    id: row.id,
    storageWeekEnding: toDateOnly(row.storage_week_ending),
    status: row.status,
    schemaVersion: row.schema_version,
    failedReason: row.failed_reason,
    dataCutoffAt: toIso(row.data_cutoff_at),
    payload: row.payload,
    inputFingerprint: row.input_fingerprint,
    sourceManifest: row.source_manifest,
    readiness: row.readiness,
    previousSnapshotId: row.previous_snapshot_id,
    artifactKey: row.artifact_key,
    artifactChecksum: row.artifact_checksum,
    artifactSizeBytes: row.artifact_size_bytes === null ? null : Number(row.artifact_size_bytes),
    artifactContentType: row.artifact_content_type,
    createdAt: toIso(row.created_at) as string,
    updatedAt: toIso(row.updated_at) as string,
    publishedAt: toIso(row.published_at)
  };
}

/** Postgres unique-violation SQLSTATE -- used to detect a concurrent duplicate draft-create racing the weekly_report_snapshots_active_week_key partial index, not treated as a generic failure. */
const UNIQUE_VIOLATION = "23505";
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION;
}

export type CreateDraftInput = {
  storageWeekEnding: StorageWeekEnding;
  schemaVersion: string;
  previousSnapshotId?: string | null;
};

/**
 * Creates a new "pending" attempt for a storage week. Idempotent per
 * Phase 7A decision #1: if an active (pending/building/ready) attempt for
 * this exact week already exists -- e.g. a retried or duplicate cron
 * delivery -- this returns that existing row rather than erroring or
 * creating a second concurrent attempt. A *failed* prior attempt for the
 * same week does not block a fresh one (see schema.sql's partial-index
 * comment); a *published* attempt is an application-level check the caller
 * (Phase 7B's orchestration gating) is responsible for making before ever
 * calling this.
 */
export async function createDraftSnapshot(pool: Pool, input: CreateDraftInput): Promise<WeeklyReportSnapshotRecord> {
  try {
    const result = await pool.query(
      `INSERT INTO weekly_report_snapshots (storage_week_ending, schema_version, status, previous_snapshot_id)
       VALUES ($1, $2, 'pending', $3)
       RETURNING ${SELECT_COLUMNS}`,
      [input.storageWeekEnding, input.schemaVersion, input.previousSnapshotId ?? null]
    );
    return mapRow(result.rows[0] as WeeklyReportSnapshotRow);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getActiveSnapshotForWeek(pool, input.storageWeekEnding);
    if (existing) return existing;
    throw error; // genuinely unexpected: the unique violation fired but no active row is now visible
  }
}

export async function getSnapshotById(pool: Pool, id: string): Promise<WeeklyReportSnapshotRecord | null> {
  const result = await pool.query(`SELECT ${SELECT_COLUMNS} FROM weekly_report_snapshots WHERE id = $1`, [id]);
  const row = result.rows[0] as WeeklyReportSnapshotRow | undefined;
  return row ? mapRow(row) : null;
}

/** The pending/building/ready row for a given week, if any -- at most one can exist per weekly_report_snapshots_active_week_key. */
export async function getActiveSnapshotForWeek(pool: Pool, storageWeekEnding: StorageWeekEnding): Promise<WeeklyReportSnapshotRecord | null> {
  const result = await pool.query(
    `SELECT ${SELECT_COLUMNS} FROM weekly_report_snapshots
     WHERE storage_week_ending = $1 AND status IN ('pending', 'building', 'ready')`,
    [storageWeekEnding]
  );
  const row = result.rows[0] as WeeklyReportSnapshotRow | undefined;
  return row ? mapRow(row) : null;
}

/** The published row for a given week, if any -- at most one can exist per weekly_report_snapshots_published_week_key. */
export async function getPublishedSnapshotForWeek(pool: Pool, storageWeekEnding: StorageWeekEnding): Promise<WeeklyReportSnapshotRecord | null> {
  const result = await pool.query(
    `SELECT ${SELECT_COLUMNS} FROM weekly_report_snapshots WHERE storage_week_ending = $1 AND status = 'published'`,
    [storageWeekEnding]
  );
  const row = result.rows[0] as WeeklyReportSnapshotRow | undefined;
  return row ? mapRow(row) : null;
}

/** The single report the app is allowed to expose to users (Phase 7A decision #4: "application exposes only latest published report"). Null before any report has ever been published. */
export async function getLatestPublishedSnapshot(pool: Pool): Promise<WeeklyReportSnapshotRecord | null> {
  const result = await pool.query(
    `SELECT ${SELECT_COLUMNS} FROM weekly_report_snapshots WHERE status = 'published' ORDER BY storage_week_ending DESC LIMIT 1`
  );
  const row = result.rows[0] as WeeklyReportSnapshotRow | undefined;
  return row ? mapRow(row) : null;
}

/**
 * The most recently published report strictly before a given week -- the
 * query-time authority for previous-week comparisons (Phase 7A decision #5),
 * preferred over trusting a row's stored previous_snapshot_id pointer (see
 * that column's comment in schema.sql). Real persisted history only;
 * returns null (never a fabricated placeholder) until at least one earlier
 * report has been published.
 */
export async function getPreviousPublishedSnapshot(pool: Pool, beforeStorageWeekEnding: StorageWeekEnding): Promise<WeeklyReportSnapshotRecord | null> {
  const result = await pool.query(
    `SELECT ${SELECT_COLUMNS} FROM weekly_report_snapshots
     WHERE status = 'published' AND storage_week_ending < $1
     ORDER BY storage_week_ending DESC LIMIT 1`,
    [beforeStorageWeekEnding]
  );
  const row = result.rows[0] as WeeklyReportSnapshotRow | undefined;
  return row ? mapRow(row) : null;
}

/** Atomic pending -> building. Returns null (does not throw) if the row is missing or was no longer "pending" -- e.g. a concurrent runner already claimed it. */
export async function transitionToBuilding(pool: Pool, id: string): Promise<WeeklyReportSnapshotRecord | null> {
  const result = await pool.query(
    `UPDATE weekly_report_snapshots SET status = 'building', updated_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING ${SELECT_COLUMNS}`,
    [id]
  );
  const row = result.rows[0] as WeeklyReportSnapshotRow | undefined;
  return row ? mapRow(row) : null;
}

export type FreezeSnapshotInput = {
  dataCutoffAt: string;
  payload: WeeklyReportPayload;
  inputFingerprint: string;
  sourceManifest: SourceFreshnessManifest;
  readiness: unknown;
};

/**
 * Atomic building -> ready, and the one place any of these five columns is
 * ever written -- once a row leaves "building", its frozen inputs never
 * change again (Phase 7A decision #2: "once published, underlying inputs
 * must never silently mutate" -- enforced here one state earlier, at
 * freeze time, since "ready" is already meant to be the frozen state that
 * "published" merely adds an artifact pointer to).
 */
export async function freezeSnapshot(pool: Pool, id: string, input: FreezeSnapshotInput): Promise<WeeklyReportSnapshotRecord | null> {
  const result = await pool.query(
    `UPDATE weekly_report_snapshots SET
       status = 'ready',
       data_cutoff_at = $2,
       payload = $3,
       input_fingerprint = $4,
       source_manifest = $5,
       readiness = $6,
       updated_at = now()
     WHERE id = $1 AND status = 'building'
     RETURNING ${SELECT_COLUMNS}`,
    [id, input.dataCutoffAt, JSON.stringify(input.payload), input.inputFingerprint, JSON.stringify(input.sourceManifest), JSON.stringify(input.readiness)]
  );
  const row = result.rows[0] as WeeklyReportSnapshotRow | undefined;
  return row ? mapRow(row) : null;
}

export type PublishSnapshotInput = {
  artifactKey: string;
  artifactChecksum: string;
  artifactSizeBytes: number;
  artifactContentType?: string;
};

/**
 * Atomic ready -> published -- the one place a row's status ever becomes
 * "published", and (with weekly_report_snapshots_published_week_key) the
 * mechanism that makes "latest published report" and "never replace a
 * valid published report with a failed one" both true by construction
 * rather than by caller discipline. Returns null if the row wasn't "ready"
 * (already published, failed, or never reached ready) -- callers must not
 * assume a call here succeeded without checking the return value.
 */
export async function publishSnapshot(pool: Pool, id: string, input: PublishSnapshotInput): Promise<WeeklyReportSnapshotRecord | null> {
  const result = await pool.query(
    `UPDATE weekly_report_snapshots SET
       status = 'published',
       published_at = now(),
       artifact_key = $2,
       artifact_checksum = $3,
       artifact_size_bytes = $4,
       artifact_content_type = $5,
       updated_at = now()
     WHERE id = $1 AND status = 'ready'
     RETURNING ${SELECT_COLUMNS}`,
    [id, input.artifactKey, input.artifactChecksum, input.artifactSizeBytes, input.artifactContentType ?? "application/pdf"]
  );
  const row = result.rows[0] as WeeklyReportSnapshotRow | undefined;
  return row ? mapRow(row) : null;
}

/** Atomic (pending|building|ready) -> failed. A published row can never be marked failed -- there is deliberately no WHERE clause branch that permits it, so this can never be the mechanism that "un-publishes" a valid report. */
export async function markSnapshotFailed(pool: Pool, id: string, reason: string): Promise<WeeklyReportSnapshotRecord | null> {
  const result = await pool.query(
    `UPDATE weekly_report_snapshots SET status = 'failed', failed_reason = $2, updated_at = now()
     WHERE id = $1 AND status IN ('pending', 'building', 'ready')
     RETURNING ${SELECT_COLUMNS}`,
    [id, reason]
  );
  const row = result.rows[0] as WeeklyReportSnapshotRow | undefined;
  return row ? mapRow(row) : null;
}

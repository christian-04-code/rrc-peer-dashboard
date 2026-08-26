import type { Pool } from "pg";
import type { SteoPoint, SteoSnapshotRecord } from "@/lib/market/macro-steo-types";

type SteoSnapshotRow = {
  series_id: string;
  label: string;
  unit: string;
  snapshot_month: string;
  fetched_at: Date | string;
  source_route: string;
  points: SteoPoint[];
};

function mapRow(row: SteoSnapshotRow): SteoSnapshotRecord {
  return {
    seriesId: row.series_id,
    label: row.label,
    unit: row.unit,
    snapshotMonth: row.snapshot_month,
    fetchedAt: row.fetched_at instanceof Date ? row.fetched_at.toISOString() : row.fetched_at,
    sourceRoute: row.source_route,
    points: row.points
  };
}

/**
 * Idempotent per (series, calendar month): re-running the same month's
 * refresh overwrites that month's row with the latest fetch rather than
 * creating a duplicate or erroring -- a real repeat scheduled run (or a
 * manual re-trigger the same day) must never fabricate a second "vintage"
 * for a month that already has one.
 */
export async function upsertSteoSnapshot(pool: Pool, snapshot: SteoSnapshotRecord): Promise<void> {
  await pool.query(
    `INSERT INTO macro_steo_snapshots (series_id, label, unit, snapshot_month, fetched_at, source_route, points)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (series_id, snapshot_month) DO UPDATE SET
       label = EXCLUDED.label,
       unit = EXCLUDED.unit,
       fetched_at = EXCLUDED.fetched_at,
       source_route = EXCLUDED.source_route,
       points = EXCLUDED.points,
       updated_at = now()`,
    [snapshot.seriesId, snapshot.label, snapshot.unit, snapshot.snapshotMonth, snapshot.fetchedAt, snapshot.sourceRoute, JSON.stringify(snapshot.points)]
  );
}

/** Most recent `limit` snapshots for one series, newest first (by snapshot_month). */
export async function getLatestSteoSnapshots(pool: Pool, seriesId: string, limit = 2): Promise<SteoSnapshotRecord[]> {
  const result = await pool.query(
    `SELECT series_id, label, unit, snapshot_month, fetched_at, source_route, points
     FROM macro_steo_snapshots
     WHERE series_id = $1
     ORDER BY snapshot_month DESC
     LIMIT $2`,
    [seriesId, limit]
  );
  return (result.rows as SteoSnapshotRow[]).map(mapRow);
}

/**
 * The exact pair computeForecastRevisions() (lib/market/macro-steo.ts)
 * needs: the current snapshot and the one immediately before it, if both
 * exist. Either or both may be null (e.g. the very first time a series is
 * ever fetched) -- callers must handle that, not assume two snapshots
 * always exist.
 */
export async function getCurrentAndPreviousSteoSnapshot(
  pool: Pool,
  seriesId: string
): Promise<{ current: SteoSnapshotRecord | null; previous: SteoSnapshotRecord | null }> {
  const [current, previous] = await getLatestSteoSnapshots(pool, seriesId, 2);
  return { current: current ?? null, previous: previous ?? null };
}

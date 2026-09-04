import type { Pool } from "pg";

/**
 * Durable "when did our system first confirm this EIA storage week's data
 * was live/available" ledger -- Phase 7F's anchor for the publish safety
 * buffer (see orchestrate-weekly.ts). Deliberately its own tiny table, not
 * a reuse of weekly_report_snapshots.created_at: that timestamp is only
 * set once a FULL snapshot build succeeds (collect every subsystem's
 * evidence, evaluate full readiness, freeze the payload), which on a
 * once-daily Hobby cron means "just built" is always true the very run
 * that first detects a new week -- anchoring the buffer there would
 * guarantee a needless extra day's delay even when the underlying EIA data
 * was already safely more than an hour old by the time the cron ran. This
 * table instead records the instant OUR system first observed the storage
 * candidate live from EIA, independent of whether a snapshot build is
 * attempted for it that run.
 */

export type StorageObservationRecord = {
  storageWeekEnding: string;
  firstObservedAt: string;
};

/**
 * Insert-if-absent, always-return-the-canonical-row. `first_observed_at`
 * has `DEFAULT now()`, applied only on the INSERT branch; the `ON
 * CONFLICT ... DO UPDATE SET storage_week_ending = EXCLUDED.storage_week_ending`
 * clause is a no-op write (same value back onto the same column) that
 * exists solely so `RETURNING` always yields a row -- whether this call
 * just created the ledger entry or found one an earlier run already
 * created -- without a second round-trip to distinguish the two cases.
 */
export async function recordStorageObservationFirstSeen(pool: Pool, storageWeekEnding: string): Promise<StorageObservationRecord> {
  const result = await pool.query(
    `INSERT INTO weekly_report_storage_observations (storage_week_ending)
     VALUES ($1)
     ON CONFLICT (storage_week_ending) DO UPDATE SET storage_week_ending = EXCLUDED.storage_week_ending
     RETURNING storage_week_ending, first_observed_at`,
    [storageWeekEnding]
  );
  const row = result.rows[0] as { storage_week_ending: string; first_observed_at: string };
  return { storageWeekEnding: row.storage_week_ending, firstObservedAt: row.first_observed_at };
}

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { recordStorageObservationFirstSeen } = load("lib/reports/persistence/storage-observation-repo.ts");

/**
 * Against a FAKE Pool (matching pg's own `.query(sql, params)` shape) --
 * proves the insert-if-absent, always-return-the-canonical-row upsert
 * behavior orchestrate-weekly.ts's safety buffer depends on: the SECOND
 * call for the same storage week must return the SAME first_observed_at
 * the FIRST call recorded, never a fresh one.
 */

function fakePoolWithLedger() {
  const rows = new Map();
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      assert.match(sql, /INSERT INTO weekly_report_storage_observations/);
      const [storageWeekEnding] = params;
      if (!rows.has(storageWeekEnding)) {
        rows.set(storageWeekEnding, { storage_week_ending: storageWeekEnding, first_observed_at: `first-seen-at-call-${calls.length}` });
      }
      return { rows: [rows.get(storageWeekEnding)] };
    }
  };
}

test("recordStorageObservationFirstSeen: the first call for a new storage week inserts and returns its own first_observed_at", async () => {
  const pool = fakePoolWithLedger();
  const result = await recordStorageObservationFirstSeen(pool, "2026-08-28");
  assert.equal(result.storageWeekEnding, "2026-08-28");
  assert.equal(result.firstObservedAt, "first-seen-at-call-1");
});

test("recordStorageObservationFirstSeen: a second call for the SAME storage week returns the ORIGINAL first_observed_at, not a fresh one", async () => {
  const pool = fakePoolWithLedger();
  const first = await recordStorageObservationFirstSeen(pool, "2026-08-28");
  const second = await recordStorageObservationFirstSeen(pool, "2026-08-28");
  const third = await recordStorageObservationFirstSeen(pool, "2026-08-28");

  assert.equal(second.firstObservedAt, first.firstObservedAt);
  assert.equal(third.firstObservedAt, first.firstObservedAt);
  assert.equal(pool.calls.length, 3, "every call still hits the DB (an upsert, not an in-process cache) -- only the RETURNED value stays stable");
});

test("recordStorageObservationFirstSeen: different storage weeks get independent ledger entries", async () => {
  const pool = fakePoolWithLedger();
  const weekA = await recordStorageObservationFirstSeen(pool, "2026-08-28");
  const weekB = await recordStorageObservationFirstSeen(pool, "2026-09-04");
  assert.notEqual(weekA.firstObservedAt, weekB.firstObservedAt);
  assert.equal(weekA.storageWeekEnding, "2026-08-28");
  assert.equal(weekB.storageWeekEnding, "2026-09-04");
});

test("recordStorageObservationFirstSeen: issues an ON CONFLICT upsert against storage_week_ending, never a plain INSERT that could fail on retry", () => {
  const source = require("node:fs").readFileSync(require("node:path").resolve(__dirname, "../lib/reports/persistence/storage-observation-repo.ts"), "utf8");
  assert.match(source, /ON CONFLICT \(storage_week_ending\)/);
  assert.match(source, /RETURNING storage_week_ending, first_observed_at/);
});

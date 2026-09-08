const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

/**
 * Requires a real Postgres reachable at DATABASE_URL/POSTGRES_URL, same
 * convention as tests/macro-steo-persistence.test.cjs and
 * tests/macro-orchestration-repo.test.cjs -- skips loudly, not silently,
 * when unavailable.
 */
const databaseConfigured = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const skip = databaseConfigured ? false : "DATABASE_URL/POSTGRES_URL not set -- no Postgres available in this environment.";

if (!databaseConfigured) {
  console.log("[weekly-report-repo.test.cjs] SKIPPED: no DATABASE_URL/POSTGRES_URL configured.");
}

let pool;

test.before(async () => {
  if (!databaseConfigured) return;
  const path = require("node:path");
  const { pathToFileURL } = require("node:url");
  const { runMigrations } = await import(pathToFileURL(path.resolve(__dirname, "../scripts/reports/migrate.mjs")).href);
  await runMigrations();
  const { getPool } = load("lib/persistence/db.ts");
  pool = getPool();
  await pool.query("TRUNCATE weekly_report_snapshots CASCADE");
});

test.after(async () => {
  if (pool) await pool.end();
});

test.beforeEach(async () => {
  if (pool) await pool.query("TRUNCATE weekly_report_snapshots CASCADE");
});

const SCHEMA_VERSION = "1.0.0";

function freezeInput(overrides = {}) {
  return {
    dataCutoffAt: "2026-08-28T12:00:00.000Z",
    payload: {
      schemaVersion: SCHEMA_VERSION,
      storageWeekEnding: "2026-08-28",
      dataCutoffAt: "2026-08-28T12:00:00.000Z",
      modules: { storage: { headline: "test" } },
      sourceManifest: { generatedFrom: [] }
    },
    inputFingerprint: "fingerprint-a",
    sourceManifest: { generatedFrom: [{ key: "storage", label: "EIA Weekly Storage", period: "2026-08-28", freshness: "current", included: true }] },
    readiness: { ready: true, missingRequired: [], degradedOptional: [] },
    ...overrides
  };
}

function publishInput(overrides = {}) {
  return {
    artifactKey: "reports/2026-08-28.pdf",
    artifactChecksum: "abc123",
    artifactSizeBytes: 123456,
    ...overrides
  };
}

test("createDraftSnapshot then getActiveSnapshotForWeek round-trips a pending row", { skip }, async () => {
  const { createDraftSnapshot, getActiveSnapshotForWeek } = load("lib/reports/persistence/report-repo.ts");
  const created = await createDraftSnapshot(pool, { storageWeekEnding: "2026-08-28", schemaVersion: SCHEMA_VERSION });
  assert.equal(created.status, "pending");
  assert.equal(created.storageWeekEnding, "2026-08-28");

  const active = await getActiveSnapshotForWeek(pool, "2026-08-28");
  assert.equal(active.id, created.id);
});

test("createDraftSnapshot is idempotent -- a second call for the same week while one is active returns the existing row, not a duplicate", { skip }, async () => {
  const { createDraftSnapshot } = load("lib/reports/persistence/report-repo.ts");
  const first = await createDraftSnapshot(pool, { storageWeekEnding: "2026-08-28", schemaVersion: SCHEMA_VERSION });
  const second = await createDraftSnapshot(pool, { storageWeekEnding: "2026-08-28", schemaVersion: SCHEMA_VERSION });
  assert.equal(second.id, first.id);

  const count = await pool.query("SELECT COUNT(*)::int AS count FROM weekly_report_snapshots WHERE storage_week_ending = '2026-08-28'");
  assert.equal(count.rows[0].count, 1, "must not create a second active row for the same storage week");
});

test("createDraftSnapshot allows a fresh attempt for the same week after the prior attempt failed", { skip }, async () => {
  const { createDraftSnapshot, markSnapshotFailed } = load("lib/reports/persistence/report-repo.ts");
  const first = await createDraftSnapshot(pool, { storageWeekEnding: "2026-08-28", schemaVersion: SCHEMA_VERSION });
  const failed = await markSnapshotFailed(pool, first.id, "upstream EIA fetch failed");
  assert.equal(failed.status, "failed");

  const retry = await createDraftSnapshot(pool, { storageWeekEnding: "2026-08-28", schemaVersion: SCHEMA_VERSION });
  assert.notEqual(retry.id, first.id, "a retry after failure must be a new row, not a resurrection of the failed one");
  assert.equal(retry.status, "pending");

  const count = await pool.query("SELECT COUNT(*)::int AS count FROM weekly_report_snapshots WHERE storage_week_ending = '2026-08-28'");
  assert.equal(count.rows[0].count, 2);
});

test("the DB-level active-week uniqueness constraint rejects a second concurrent active row even via a raw insert", { skip }, async () => {
  const { createDraftSnapshot } = load("lib/reports/persistence/report-repo.ts");
  await createDraftSnapshot(pool, { storageWeekEnding: "2026-08-28", schemaVersion: SCHEMA_VERSION });

  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO weekly_report_snapshots (storage_week_ending, schema_version, status) VALUES ($1, $2, 'building')`,
        ["2026-08-28", SCHEMA_VERSION]
      ),
    /duplicate key value violates unique constraint/
  );
});

test("full lifecycle: pending -> building -> ready -> published, with artifact/frozen fields set only at their own step", { skip }, async () => {
  const { createDraftSnapshot, transitionToBuilding, freezeSnapshot, publishSnapshot, getSnapshotById } = load("lib/reports/persistence/report-repo.ts");

  const draft = await createDraftSnapshot(pool, { storageWeekEnding: "2026-08-28", schemaVersion: SCHEMA_VERSION });
  assert.equal(draft.payload, null);

  const building = await transitionToBuilding(pool, draft.id);
  assert.equal(building.status, "building");

  const ready = await freezeSnapshot(pool, draft.id, freezeInput());
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.payload.modules, { storage: { headline: "test" } });
  assert.equal(ready.inputFingerprint, "fingerprint-a");
  assert.equal(ready.artifactKey, null, "artifact fields must stay null until publish, not freeze");

  const published = await publishSnapshot(pool, draft.id, publishInput());
  assert.equal(published.status, "published");
  assert.equal(published.artifactKey, "reports/2026-08-28.pdf");
  assert.equal(published.artifactSizeBytes, 123456);
  assert.ok(published.publishedAt && !Number.isNaN(Date.parse(published.publishedAt)));

  const reloaded = await getSnapshotById(pool, draft.id);
  assert.equal(reloaded.status, "published");
});

test("transitionToBuilding returns null, does not throw, when the row is not pending", { skip }, async () => {
  const { createDraftSnapshot, transitionToBuilding } = load("lib/reports/persistence/report-repo.ts");
  const draft = await createDraftSnapshot(pool, { storageWeekEnding: "2026-08-28", schemaVersion: SCHEMA_VERSION });
  await transitionToBuilding(pool, draft.id);

  const secondAttempt = await transitionToBuilding(pool, draft.id);
  assert.equal(secondAttempt, null, "a row already in 'building' cannot be transitioned to 'building' again");
});

test("freezeSnapshot returns null when the row is not building", { skip }, async () => {
  const { createDraftSnapshot, freezeSnapshot } = load("lib/reports/persistence/report-repo.ts");
  const draft = await createDraftSnapshot(pool, { storageWeekEnding: "2026-08-28", schemaVersion: SCHEMA_VERSION });
  const result = await freezeSnapshot(pool, draft.id, freezeInput());
  assert.equal(result, null, "a still-pending row (never moved to building) cannot be frozen directly");
});

test("publishSnapshot returns null when the row is not ready", { skip }, async () => {
  const { createDraftSnapshot, publishSnapshot } = load("lib/reports/persistence/report-repo.ts");
  const draft = await createDraftSnapshot(pool, { storageWeekEnding: "2026-08-28", schemaVersion: SCHEMA_VERSION });
  const result = await publishSnapshot(pool, draft.id, publishInput());
  assert.equal(result, null, "a still-pending row cannot be published directly");
});

test("publishSnapshot can never be called twice successfully -- the second call is a no-op that returns null, never a second published row", { skip }, async () => {
  const { createDraftSnapshot, transitionToBuilding, freezeSnapshot, publishSnapshot } = load("lib/reports/persistence/report-repo.ts");
  const draft = await createDraftSnapshot(pool, { storageWeekEnding: "2026-08-28", schemaVersion: SCHEMA_VERSION });
  await transitionToBuilding(pool, draft.id);
  await freezeSnapshot(pool, draft.id, freezeInput());

  const first = await publishSnapshot(pool, draft.id, publishInput());
  assert.equal(first.status, "published");

  const second = await publishSnapshot(pool, draft.id, publishInput({ artifactKey: "reports/2026-08-28-v2.pdf" }));
  assert.equal(second, null);
});

test("markSnapshotFailed can never mark an already-published row as failed -- a published report is never un-published in place", { skip }, async () => {
  const { createDraftSnapshot, transitionToBuilding, freezeSnapshot, publishSnapshot, markSnapshotFailed } = load(
    "lib/reports/persistence/report-repo.ts"
  );
  const draft = await createDraftSnapshot(pool, { storageWeekEnding: "2026-08-28", schemaVersion: SCHEMA_VERSION });
  await transitionToBuilding(pool, draft.id);
  await freezeSnapshot(pool, draft.id, freezeInput());
  await publishSnapshot(pool, draft.id, publishInput());

  const result = await markSnapshotFailed(pool, draft.id, "should never apply");
  assert.equal(result, null);
});

test("the DB-level published-week uniqueness constraint blocks a second published row for the same week even from a different attempt", { skip }, async () => {
  const { createDraftSnapshot, transitionToBuilding, freezeSnapshot, publishSnapshot, markSnapshotFailed } = load(
    "lib/reports/persistence/report-repo.ts"
  );

  const firstAttempt = await createDraftSnapshot(pool, { storageWeekEnding: "2026-08-28", schemaVersion: SCHEMA_VERSION });
  await transitionToBuilding(pool, firstAttempt.id);
  await freezeSnapshot(pool, firstAttempt.id, freezeInput());
  await publishSnapshot(pool, firstAttempt.id, publishInput());

  // A second attempt for the same week is allowed to be created and built
  // (e.g. an operator manually forcing a re-run) -- but publishing it must
  // fail at the database layer even if application-level gating is bypassed.
  const secondAttempt = await createDraftSnapshot(pool, { storageWeekEnding: "2026-08-28", schemaVersion: SCHEMA_VERSION });
  assert.notEqual(secondAttempt.id, firstAttempt.id);
  await transitionToBuilding(pool, secondAttempt.id);
  await freezeSnapshot(pool, secondAttempt.id, freezeInput({ inputFingerprint: "fingerprint-b" }));

  await assert.rejects(
    () => publishSnapshot(pool, secondAttempt.id, publishInput({ artifactKey: "reports/2026-08-28-retry.pdf" })),
    /duplicate key value violates unique constraint/
  );

  await markSnapshotFailed(pool, secondAttempt.id, "superseded by an already-published report for this week");
});

test("getLatestPublishedSnapshot returns null before any report has ever been published", { skip }, async () => {
  const { getLatestPublishedSnapshot } = load("lib/reports/persistence/report-repo.ts");
  assert.equal(await getLatestPublishedSnapshot(pool), null);
});

test("getLatestPublishedSnapshot and getPreviousPublishedSnapshot correctly order across multiple published weeks", { skip }, async () => {
  const { createDraftSnapshot, transitionToBuilding, freezeSnapshot, publishSnapshot, getLatestPublishedSnapshot, getPreviousPublishedSnapshot } = load(
    "lib/reports/persistence/report-repo.ts"
  );

  async function publishWeek(storageWeekEnding) {
    const draft = await createDraftSnapshot(pool, { storageWeekEnding, schemaVersion: SCHEMA_VERSION });
    await transitionToBuilding(pool, draft.id);
    await freezeSnapshot(pool, draft.id, freezeInput({ payload: { ...freezeInput().payload, storageWeekEnding } }));
    return publishSnapshot(pool, draft.id, publishInput({ artifactKey: `reports/${storageWeekEnding}.pdf` }));
  }

  const wk1 = await publishWeek("2026-08-14");
  const wk2 = await publishWeek("2026-08-21");
  const wk3 = await publishWeek("2026-08-28");

  const latest = await getLatestPublishedSnapshot(pool);
  assert.equal(latest.id, wk3.id);

  const previousOfLatest = await getPreviousPublishedSnapshot(pool, "2026-08-28");
  assert.equal(previousOfLatest.id, wk2.id);

  const previousOfFirst = await getPreviousPublishedSnapshot(pool, "2026-08-14");
  assert.equal(previousOfFirst, null, "no report exists before the very first published week");

  void wk1;
});

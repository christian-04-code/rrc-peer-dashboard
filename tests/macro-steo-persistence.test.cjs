const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

/**
 * Requires a real Postgres reachable at DATABASE_URL/POSTGRES_URL, same
 * convention as tests/news-persistence.test.cjs -- skips loudly, not
 * silently, when unavailable.
 */
const databaseConfigured = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const skip = databaseConfigured ? false : "DATABASE_URL/POSTGRES_URL not set -- no Postgres available in this environment.";

if (!databaseConfigured) {
  console.log("[macro-steo-persistence.test.cjs] SKIPPED: no DATABASE_URL/POSTGRES_URL configured.");
}

let pool;

test.before(async () => {
  if (!databaseConfigured) return;
  const path = require("node:path");
  const { pathToFileURL } = require("node:url");
  const { runMigrations } = await import(pathToFileURL(path.resolve(__dirname, "../scripts/macro/migrate.mjs")).href);
  await runMigrations();
  const { getPool } = load("lib/persistence/db.ts");
  pool = getPool();
  await pool.query("TRUNCATE macro_steo_snapshots, macro_risk_summaries CASCADE");
});

test.after(async () => {
  if (pool) await pool.end();
});

test.beforeEach(async () => {
  if (pool) await pool.query("TRUNCATE macro_steo_snapshots, macro_risk_summaries CASCADE");
});

function snapshot(seriesId, snapshotMonth, points, overrides = {}) {
  return {
    seriesId,
    label: "Natural Gas Henry Hub Spot Price ($/mcf)",
    unit: "dollars per thousand cubic feet",
    snapshotMonth,
    fetchedAt: `${snapshotMonth}-15T12:00:00.000Z`,
    sourceRoute: "steo/data",
    points,
    ...overrides
  };
}

test("upsertSteoSnapshot then getLatestSteoSnapshots round-trips exactly what was written", { skip }, async () => {
  const { upsertSteoSnapshot, getLatestSteoSnapshots } = load("lib/market/persistence/steo-repo.ts");
  await upsertSteoSnapshot(pool, snapshot("NGHHMCF", "2026-08", [{ period: "2027-01", value: 3.5 }]));

  const [row] = await getLatestSteoSnapshots(pool, "NGHHMCF", 1);
  assert.equal(row.seriesId, "NGHHMCF");
  assert.equal(row.snapshotMonth, "2026-08");
  assert.deepEqual(row.points, [{ period: "2027-01", value: 3.5 }]);
});

test("upsertSteoSnapshot is idempotent per (series, month) -- a repeat refresh within the same month overwrites, never duplicates", { skip }, async () => {
  const { upsertSteoSnapshot, getLatestSteoSnapshots } = load("lib/market/persistence/steo-repo.ts");
  await upsertSteoSnapshot(pool, snapshot("NGHHMCF", "2026-08", [{ period: "2027-01", value: 3.5 }]));
  await upsertSteoSnapshot(pool, snapshot("NGHHMCF", "2026-08", [{ period: "2027-01", value: 3.6 }]));

  const rows = await getLatestSteoSnapshots(pool, "NGHHMCF", 10);
  assert.equal(rows.length, 1, "must not create a second row for the same (series, month)");
  assert.equal(rows[0].points[0].value, 3.6, "the later fetch's data must win");
});

test("getCurrentAndPreviousSteoSnapshot returns the two most recent months, most recent first", { skip }, async () => {
  const { upsertSteoSnapshot } = load("lib/market/persistence/steo-repo.ts");
  const { getCurrentAndPreviousSteoSnapshot } = load("lib/market/persistence/steo-repo.ts");
  await upsertSteoSnapshot(pool, snapshot("NGHHMCF", "2026-06", [{ period: "2027-01", value: 3.2 }]));
  await upsertSteoSnapshot(pool, snapshot("NGHHMCF", "2026-07", [{ period: "2027-01", value: 3.4 }]));
  await upsertSteoSnapshot(pool, snapshot("NGHHMCF", "2026-08", [{ period: "2027-01", value: 3.5 }]));

  const { current, previous } = await getCurrentAndPreviousSteoSnapshot(pool, "NGHHMCF");
  assert.equal(current.snapshotMonth, "2026-08");
  assert.equal(previous.snapshotMonth, "2026-07");
});

test("getCurrentAndPreviousSteoSnapshot returns nulls, not a crash, when a series has never been fetched", { skip }, async () => {
  const { getCurrentAndPreviousSteoSnapshot } = load("lib/market/persistence/steo-repo.ts");
  const { current, previous } = await getCurrentAndPreviousSteoSnapshot(pool, "NEVER_FETCHED_SERIES");
  assert.equal(current, null);
  assert.equal(previous, null);
});

test("getCurrentAndPreviousSteoSnapshot returns a null previous, not a crash, on a series' very first snapshot", { skip }, async () => {
  const { upsertSteoSnapshot, getCurrentAndPreviousSteoSnapshot } = load("lib/market/persistence/steo-repo.ts");
  await upsertSteoSnapshot(pool, snapshot("NGHHMCF", "2026-08", [{ period: "2027-01", value: 3.5 }]));
  const { current, previous } = await getCurrentAndPreviousSteoSnapshot(pool, "NGHHMCF");
  assert.equal(current.snapshotMonth, "2026-08");
  assert.equal(previous, null);
});

test("real snapshots round-tripped through Postgres still produce correct forecast revisions end-to-end", { skip }, async () => {
  const { upsertSteoSnapshot, getCurrentAndPreviousSteoSnapshot } = load("lib/market/persistence/steo-repo.ts");
  const { computeForecastRevisions } = load("lib/market/macro-steo.ts");

  await upsertSteoSnapshot(pool, snapshot("NGHHMCF", "2026-07", [{ period: "2027-01", value: 3.2 }, { period: "2027-02", value: 3.3 }]));
  await upsertSteoSnapshot(pool, snapshot("NGHHMCF", "2026-08", [{ period: "2027-01", value: 3.5 }, { period: "2027-02", value: 3.1 }]));

  const { current, previous } = await getCurrentAndPreviousSteoSnapshot(pool, "NGHHMCF");
  const revisions = computeForecastRevisions(previous, current);

  const jan = revisions.find((r) => r.period === "2027-01");
  assert.ok(Math.abs(jan.delta - 0.3) < 1e-9, "EIA raised its 2027-01 forecast by 0.3 -- an upward revision");
  const feb = revisions.find((r) => r.period === "2027-02");
  assert.ok(feb.delta < 0, "EIA cut its 2027-02 forecast -- a downward revision");
});

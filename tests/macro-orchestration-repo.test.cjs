const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

/**
 * Requires a real Postgres reachable at DATABASE_URL/POSTGRES_URL, same
 * convention as tests/macro-steo-persistence.test.cjs.
 */
const databaseConfigured = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const skip = databaseConfigured ? false : "DATABASE_URL/POSTGRES_URL not set -- no Postgres available in this environment.";

if (!databaseConfigured) {
  console.log("[macro-orchestration-repo.test.cjs] SKIPPED: no DATABASE_URL/POSTGRES_URL configured.");
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
  await pool.query("TRUNCATE macro_orchestration_runs CASCADE");
});

test.after(async () => {
  if (pool) await pool.end();
});

test.beforeEach(async () => {
  if (pool) await pool.query("TRUNCATE macro_orchestration_runs CASCADE");
});

test("getLatestOrchestrationTimestamp returns null (never the browser's/server's current time) before any cron run has ever completed", { skip }, async () => {
  const { getLatestOrchestrationTimestamp } = load("lib/market/persistence/orchestration-repo.ts");
  assert.equal(await getLatestOrchestrationTimestamp(pool), null);
});

test("recordOrchestrationRun then getLatestOrchestrationTimestamp reflects a real, parseable completion time", { skip }, async () => {
  const { recordOrchestrationRun, getLatestOrchestrationTimestamp } = load("lib/market/persistence/orchestration-repo.ts");
  await recordOrchestrationRun(pool, { steoRefreshed: 9, steoFailed: 0, aiSummaryGenerated: true });

  const latest = await getLatestOrchestrationTimestamp(pool);
  assert.ok(latest && !Number.isNaN(Date.parse(latest)), "must be a real, parseable timestamp");
});

test("getLatestOrchestrationTimestamp advances on a genuine second run, never regresses", { skip }, async () => {
  const { recordOrchestrationRun, getLatestOrchestrationTimestamp } = load("lib/market/persistence/orchestration-repo.ts");
  await recordOrchestrationRun(pool, { steoRefreshed: 9, steoFailed: 0, aiSummaryGenerated: false });
  const first = await getLatestOrchestrationTimestamp(pool);

  await new Promise((resolve) => setTimeout(resolve, 20));
  await recordOrchestrationRun(pool, { steoRefreshed: 9, steoFailed: 0, aiSummaryGenerated: true });
  const second = await getLatestOrchestrationTimestamp(pool);

  assert.ok(new Date(second).getTime() > new Date(first).getTime(), "a real second run must advance the timestamp");
});

test("recordOrchestrationRun is append-only -- multiple runs accumulate as distinct rows, not a single overwritten status row", { skip }, async () => {
  const { recordOrchestrationRun } = load("lib/market/persistence/orchestration-repo.ts");
  await recordOrchestrationRun(pool, { steoRefreshed: 9, steoFailed: 0, aiSummaryGenerated: true });
  await recordOrchestrationRun(pool, { steoRefreshed: 8, steoFailed: 1, aiSummaryGenerated: false });

  const result = await pool.query("SELECT COUNT(*)::int AS count FROM macro_orchestration_runs");
  assert.equal(result.rows[0].count, 2);
});

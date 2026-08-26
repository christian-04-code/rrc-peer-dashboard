const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalPostgresUrl = process.env.POSTGRES_URL;
const originalEiaKey = process.env.EIA_API_KEY;

function restoreGlobals() {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = originalPostgresUrl;
  if (originalEiaKey === undefined) delete process.env.EIA_API_KEY;
  else process.env.EIA_API_KEY = originalEiaKey;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);
test.after(async () => {
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
    const { getPool } = load("lib/persistence/db.ts");
    await getPool().end().catch(() => undefined);
  }
});

function loadRoute() {
  delete require.cache[require.resolve("../app/api/macro/risk/route.ts")];
  return load("app/api/macro/risk/route.ts");
}

test("with no database configured, the route still returns 200 with deterministic signals and an explicit 'unavailable' AI summary status -- never a crash or a fabricated summary", async () => {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.EIA_API_KEY; // forces every underlying EIA fetch to fail fast, exercising the fully-degraded path
  const { GET } = loadRoute();
  const response = await GET();
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.aiSummary, null);
  assert.equal(body.aiSummaryStatus, "unavailable");
  assert.deepEqual(body.changes, []);
  assert.ok(Array.isArray(body.signals));
  assert.ok(typeof body.fingerprint === "string" && body.fingerprint.length > 0, "deterministic signals still fingerprint even with zero live data");
});

test("cache-control header gives a bounded revalidate window like the other Macro routes", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../app/api/macro/risk/route.ts"), "utf8");
  assert.match(source, /s-maxage=900/);
});

test("the route source never imports or constructs an AI provider -- reading the deterministic snapshot and cached summary only, per Section 19", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../app/api/macro/risk/route.ts"), "utf8");
  assert.doesNotMatch(source, /AnthropicMacroSummaryProvider|\.summarize\(/);
});

const databaseConfigured = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const skip = databaseConfigured ? false : "DATABASE_URL/POSTGRES_URL not set -- no Postgres available in this environment.";
if (!databaseConfigured) {
  console.log("[macro-risk-route.test.cjs] SKIPPED: DB-gated aiSummaryStatus tests -- no DATABASE_URL/POSTGRES_URL configured.");
}

test("aiSummaryStatus is 'pending' when the DB is configured but no summary has ever been generated", { skip }, async () => {
  delete process.env.EIA_API_KEY;
  const path = require("node:path");
  const { pathToFileURL } = require("node:url");
  const { runMigrations } = await import(pathToFileURL(path.resolve(__dirname, "../scripts/macro/migrate.mjs")).href);
  await runMigrations();
  const { getPool } = load("lib/persistence/db.ts");
  const pool = getPool();
  await pool.query("TRUNCATE macro_risk_summaries CASCADE");

  const { GET } = loadRoute();
  const response = await GET();
  const body = await response.json();
  assert.equal(body.aiSummaryStatus, "pending");
  assert.equal(body.aiSummary, null);
});

test("aiSummaryStatus is 'stale' (never silently 'ready') when a prior summary exists but not for the current fingerprint", { skip }, async () => {
  delete process.env.EIA_API_KEY;
  const path = require("node:path");
  const { pathToFileURL } = require("node:url");
  const { runMigrations } = await import(pathToFileURL(path.resolve(__dirname, "../scripts/macro/migrate.mjs")).href);
  await runMigrations();
  const { getPool } = load("lib/persistence/db.ts");
  const { saveMacroSummary } = load("lib/market/persistence/summary-repo.ts");
  const pool = getPool();
  await pool.query("TRUNCATE macro_risk_summaries CASCADE");
  await saveMacroSummary(pool, {
    inputFingerprint: "a-fingerprint-that-will-never-match-live-data",
    summary: "An old cached summary from a prior data snapshot.",
    riskSignals: { schemaVersion: "1.0.0", snapshotAsOf: "2020-01-01", signals: [], supportingMetrics: {} },
    aiProvider: "anthropic",
    aiModel: "claude-haiku-4-5",
    schemaVersion: "1.0.0",
    generatedAt: "2020-01-01T00:00:00.000Z"
  });

  const { GET } = loadRoute();
  const response = await GET();
  const body = await response.json();
  assert.equal(body.aiSummaryStatus, "stale");
  assert.equal(body.aiSummary.current, false);
  assert.equal(body.aiSummary.summary, "An old cached summary from a prior data snapshot.");
});

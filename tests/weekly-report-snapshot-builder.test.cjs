const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

/**
 * End-to-end lifecycle test for runWeeklySnapshotBuild() -- requires a real
 * Postgres (weekly_report_snapshots + articles + macro_steo_snapshots) AND
 * mocks global.fetch in place of the live EIA API, same combination
 * tests/weekly-report-macro-adapter.test.cjs and
 * tests/weekly-report-repo.test.cjs each use separately. Skips loudly, not
 * silently, without DATABASE_URL/POSTGRES_URL -- same established
 * convention as every other DB-gated test in this repo.
 */

const databaseConfigured = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const skip = databaseConfigured ? false : "DATABASE_URL/POSTGRES_URL not set -- no Postgres available in this environment.";
if (!databaseConfigured) {
  console.log("[weekly-report-snapshot-builder.test.cjs] SKIPPED: no DATABASE_URL/POSTGRES_URL configured.");
}

const originalFetch = global.fetch;
const originalEiaKey = process.env.EIA_API_KEY;
function restoreGlobals() {
  global.fetch = originalFetch;
  if (originalEiaKey === undefined) delete process.env.EIA_API_KEY;
  else process.env.EIA_API_KEY = originalEiaKey;
}
test.afterEach(restoreGlobals);
test.after(restoreGlobals);

let pool;

test.before(async () => {
  if (!databaseConfigured) return;
  const path = require("node:path");
  const { pathToFileURL } = require("node:url");
  const { runMigrations: runReportMigrations } = await import(pathToFileURL(path.resolve(__dirname, "../scripts/reports/migrate.mjs")).href);
  const { runMigrations: runMacroMigrations } = await import(pathToFileURL(path.resolve(__dirname, "../scripts/macro/migrate.mjs")).href);
  const { runMigrations: runNewsMigrations } = await import(pathToFileURL(path.resolve(__dirname, "../scripts/news/migrate.mjs")).href);
  await runReportMigrations();
  await runMacroMigrations();
  await runNewsMigrations();
  const { getPool } = load("lib/persistence/db.ts");
  pool = getPool();
});

test.after(async () => {
  if (pool) await pool.end();
});

test.beforeEach(async () => {
  if (pool) await pool.query("TRUNCATE weekly_report_snapshots, macro_steo_snapshots, articles CASCADE");
});

function mostRecentFriday(from) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const diff = (d.getUTCDay() - 5 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}
const LATEST_FRIDAY = mostRecentFriday(new Date());
const DAY_MS = 24 * 60 * 60 * 1000;

function eiaResponse(rows) {
  return new Response(JSON.stringify({ response: { data: rows } }), { status: 200, headers: { "content-type": "application/json" } });
}
function weeklyFridayRows(seriesId, startValue, weeks, anchor = LATEST_FRIDAY) {
  const rows = [];
  for (let i = 0; i < weeks; i += 1) {
    const period = new Date(anchor.getTime() - i * 7 * DAY_MS).toISOString().slice(0, 10);
    rows.push({ period, value: startValue - i * 2, series: seriesId });
  }
  return rows;
}
function monthlySeries(seriesId, startValue, months = 24, anchor = LATEST_FRIDAY) {
  const rows = [];
  for (let i = 0; i < months; i += 1) {
    const date = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1));
    rows.push({ period: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`, value: startValue + i * 500, series: seriesId });
  }
  return rows;
}
function dailySeries(seriesId, startValue, days = 40, anchor = LATEST_FRIDAY) {
  const rows = [];
  for (let i = 0; i < days; i += 1) rows.push({ period: new Date(anchor.getTime() - i * DAY_MS).toISOString().slice(0, 10), value: startValue - i * 0.01, series: seriesId });
  return rows;
}
function stateProductionRows(anchor = LATEST_FRIDAY) {
  const states = [{ name: "Pennsylvania", base: 700_000 }, { name: "West Virginia", base: 300_000 }, { name: "Ohio", base: 180_000 }];
  const rows = [];
  for (const state of states) {
    for (let i = 0; i < 24; i += 1) {
      const date = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1));
      rows.push({ period: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`, value: state.base + i * 500, "area-name": state.name });
    }
  }
  return rows;
}
function demandRows(anchor = LATEST_FRIDAY) {
  const series = { residential: "N3010US2", commercial: "N3020US2", industrial: "N3035US2", electricPower: "N3045US2" };
  const rows = [];
  for (const [, seriesId] of Object.entries(series)) rows.push(...monthlySeries(seriesId, 500_000, 18, anchor));
  return rows;
}
function steoRows(anchor = LATEST_FRIDAY) {
  const series = { NGHHMCF: "Henry Hub", NGPRPUS: "Dry Production", NGWGPUS: "Storage", NGEXPUS_LNG: "LNG Exports", NGEPCNS_US: "Power", NGINX_US: "Industrial", NGTCPUS: "Total", NGRCPUS: "Residential", NGCCPUS: "Commercial" };
  const rows = [];
  for (const [seriesId, label] of Object.entries(series)) {
    for (let i = -2; i < 20; i += 1) {
      const date = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + i, 1));
      rows.push({ period: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`, value: 10 + i, seriesId, seriesDescription: label, unit: "billion cubic feet per day" });
    }
  }
  return rows;
}

function mockAllSources({ anchor = LATEST_FRIDAY, storageOnly = false } = {}) {
  global.fetch = async (url) => {
    const parsed = new URL(url.toString());
    const path = parsed.pathname;
    const seriesFacet = parsed.searchParams.get("facets[series][]");
    const seriesFromPath = decodeURIComponent(path.replace(/^\/v2\/seriesid\//, ""));

    if (seriesFromPath === "NG.NW2_EPG0_SWO_R48_BCF.W" || seriesFacet === "NG.NW2_EPG0_SWO_R48_BCF.W") return eiaResponse(weeklyFridayRows("NG.NW2_EPG0_SWO_R48_BCF.W", 950, 6, anchor));
    if (storageOnly) return eiaResponse([]);

    if (path.includes("pri/fut/data")) return eiaResponse(dailySeries("RNGWHHD", 3.2, 40, anchor));
    if (seriesFromPath === "NG.N9133US2.M" || seriesFacet === "NG.N9133US2.M") return eiaResponse(monthlySeries("NG.N9133US2.M", 3_300_000, 24, anchor));
    if (seriesFromPath === "NG.N9070US2.M" || seriesFacet === "NG.N9070US2.M") return eiaResponse(monthlySeries("NG.N9070US2.M", 3_300_000, 24, anchor));
    if (path.includes("prod/sum/data")) return eiaResponse(stateProductionRows(anchor));
    if (path.includes("cons/sum/data")) return eiaResponse(demandRows(anchor));
    if (path.includes("steo/data")) return eiaResponse(steoRows(anchor));
    return eiaResponse([]);
  };
}

function loadBuilder() {
  for (const mod of ["lib/reports/snapshot-builder.ts", "lib/reports/adapters/macro-adapter.ts"]) {
    delete require.cache[require.resolve(`../${mod}`)];
  }
  return load("lib/reports/snapshot-builder.ts");
}

test("runWeeklySnapshotBuild: reaches 'ready' with a frozen payload, real fingerprint, and no publish", { skip, timeout: 20_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  mockAllSources();
  const { runWeeklySnapshotBuild } = loadBuilder();

  const result = await runWeeklySnapshotBuild(pool, LATEST_FRIDAY);
  assert.equal(result.status, "ready");
  assert.equal(result.snapshot.status, "ready");
  assert.equal(result.snapshot.storageWeekEnding, LATEST_FRIDAY.toISOString().slice(0, 10));
  assert.ok(result.snapshot.inputFingerprint && /^[a-f0-9]{64}$/.test(result.snapshot.inputFingerprint));
  assert.ok(result.snapshot.payload.modules.storage?.length > 0);
  assert.equal(result.snapshot.publishedAt, null, "must stop at ready -- never publish");
});

test("runWeeklySnapshotBuild: a second call for the same already-ready week reports active_attempt_exists rather than creating a duplicate row", { skip, timeout: 20_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  mockAllSources();
  const { runWeeklySnapshotBuild } = loadBuilder();

  const first = await runWeeklySnapshotBuild(pool, LATEST_FRIDAY);
  assert.equal(first.status, "ready");

  const second = await runWeeklySnapshotBuild(pool, LATEST_FRIDAY);
  assert.equal(second.status, "active_attempt_exists");
  assert.equal(second.snapshot.id, first.snapshot.id);

  const count = await pool.query("SELECT COUNT(*)::int AS count FROM weekly_report_snapshots WHERE storage_week_ending = $1", [LATEST_FRIDAY.toISOString().slice(0, 10)]);
  assert.equal(count.rows[0].count, 1);
});

test("runWeeklySnapshotBuild: once a week is published, a later call reports already_published and never builds a competing attempt", { skip, timeout: 20_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  mockAllSources();
  const { runWeeklySnapshotBuild } = loadBuilder();
  const { publishSnapshot } = load("lib/reports/persistence/report-repo.ts");

  const first = await runWeeklySnapshotBuild(pool, LATEST_FRIDAY);
  assert.equal(first.status, "ready");
  await publishSnapshot(pool, first.snapshot.id, { artifactKey: "reports/test.pdf", artifactChecksum: "abc", artifactSizeBytes: 100 });

  const second = await runWeeklySnapshotBuild(pool, LATEST_FRIDAY);
  assert.equal(second.status, "already_published");
  assert.equal(second.snapshot.id, first.snapshot.id);
});

test("runWeeklySnapshotBuild: fails the attempt with a specific reason (never silently freezes) when a required input is missing", { skip, timeout: 20_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  // Storage succeeds (identity resolves) but every other Macro input fails --
  // with no 5-year lookback and no other actual series, every deterministic
  // risk signal ends up UNAVAILABLE, so rangeMacroRiskEngineOutput's
  // required input is genuinely absent.
  mockAllSources({ storageOnly: true });
  const { runWeeklySnapshotBuild } = loadBuilder();

  const result = await runWeeklySnapshotBuild(pool, LATEST_FRIDAY);
  assert.equal(result.status, "failed");
  assert.match(result.reason, /rangeMacroRiskEngineOutput/);
  assert.equal(result.snapshot.status, "failed");
  assert.equal(result.snapshot.failedReason, result.reason);
});

test("runWeeklySnapshotBuild: a second, later week correctly links to and diffs against the first week's published snapshot (materiality reflects a real change)", { skip, timeout: 25_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  const { runWeeklySnapshotBuild } = loadBuilder();
  const { publishSnapshot, getPreviousPublishedSnapshot } = load("lib/reports/persistence/report-repo.ts");

  const weekOne = LATEST_FRIDAY;
  mockAllSources({ anchor: weekOne });
  const first = await runWeeklySnapshotBuild(pool, weekOne);
  assert.equal(first.status, "ready");
  await publishSnapshot(pool, first.snapshot.id, { artifactKey: "reports/week1.pdf", artifactChecksum: "abc", artifactSizeBytes: 100 });

  const weekTwo = new Date(weekOne.getTime() + 7 * DAY_MS);
  mockAllSources({ anchor: weekTwo });
  const second = await runWeeklySnapshotBuild(pool, weekTwo);
  assert.equal(second.status, "ready");

  const previous = await getPreviousPublishedSnapshot(pool, weekTwo.toISOString().slice(0, 10));
  assert.equal(previous.id, first.snapshot.id);

  const storageItem = second.snapshot.payload.modules.storage[0];
  assert.equal(storageItem.materialityInputs.isNewThisWeek, false, "same evidenceId existed in the previous published snapshot");
  assert.equal(storageItem.materialityInputs.changedSincePreviousReport, true, "the storage fixture's latest value genuinely differs one week later");

  const storageChange = second.changes.find((c) => c.evidenceId === "storage:lower48");
  assert.ok(storageChange, "a real value change between the two published weeks must appear in the structured change set");
});

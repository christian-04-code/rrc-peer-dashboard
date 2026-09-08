const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const { computeWeeklyAnalystFingerprint } = load("lib/reports/analyst-service.ts");

// ---------------------------------------------------------------------------
// Pure fingerprint tests -- no DB needed.
// ---------------------------------------------------------------------------

function fingerprintInput(overrides = {}) {
  return { snapshotFingerprint: "abc123", schemaVersion: "1.0.0", promptVersion: "1.0.0", model: "claude-haiku-4-5", ...overrides };
}

test("computeWeeklyAnalystFingerprint: identical inputs produce identical fingerprints", () => {
  assert.equal(computeWeeklyAnalystFingerprint(fingerprintInput()), computeWeeklyAnalystFingerprint(fingerprintInput()));
});

test("computeWeeklyAnalystFingerprint: a different snapshot fingerprint changes the analysis fingerprint", () => {
  const a = computeWeeklyAnalystFingerprint(fingerprintInput());
  const b = computeWeeklyAnalystFingerprint(fingerprintInput({ snapshotFingerprint: "def456" }));
  assert.notEqual(a, b);
});

test("computeWeeklyAnalystFingerprint: a different schema version changes the analysis fingerprint", () => {
  const a = computeWeeklyAnalystFingerprint(fingerprintInput());
  const b = computeWeeklyAnalystFingerprint(fingerprintInput({ schemaVersion: "2.0.0" }));
  assert.notEqual(a, b);
});

test("computeWeeklyAnalystFingerprint: a different prompt version changes the analysis fingerprint", () => {
  const a = computeWeeklyAnalystFingerprint(fingerprintInput());
  const b = computeWeeklyAnalystFingerprint(fingerprintInput({ promptVersion: "1.1.0" }));
  assert.notEqual(a, b);
});

test("computeWeeklyAnalystFingerprint: a different model changes the analysis fingerprint", () => {
  const a = computeWeeklyAnalystFingerprint(fingerprintInput());
  const b = computeWeeklyAnalystFingerprint(fingerprintInput({ model: "claude-opus-5" }));
  assert.notEqual(a, b);
});

test("computeWeeklyAnalystFingerprint: produces a well-formed SHA-256 hex digest", () => {
  assert.match(computeWeeklyAnalystFingerprint(fingerprintInput()), /^[a-f0-9]{64}$/);
});

// ---------------------------------------------------------------------------
// Source-inspection: no browser-facing route may import the AI layer.
// ---------------------------------------------------------------------------

function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFilesRecursive(full) : [full];
  });
}

test("no app/api route imports the Weekly Analyst AI layer -- no browser-facing entry point exists yet", () => {
  const apiDir = path.resolve(__dirname, "../app/api");
  const files = listFilesRecursive(apiDir).filter((file) => /\.(ts|tsx|js)$/.test(file));
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /lib\/reports\/ai|analyst-service|AnthropicWeeklyAnalystProvider|generateWeeklyAnalysisIfNeeded/, `${file} must not import the Weekly Analyst AI layer`);
  }
});

test("app/api/reports contains only Phase 7E's read-only latest-report routes -- no generation/AI/cron route", () => {
  // Phase 7C's original version of this test asserted the directory didn't
  // exist at all. Phase 7E legitimately created it (the latest-report
  // status/download routes) -- this replacement preserves the actual
  // invariant that still matters: only those two read-only routes exist
  // here, nothing that generates a report or is scheduled.
  const reportsDir = path.resolve(__dirname, "../app/api/reports");
  const routeFiles = listFilesRecursive(reportsDir).filter((file) => /route\.(ts|tsx|js)$/.test(file));
  const relativePaths = routeFiles.map((file) => path.relative(reportsDir, file)).sort();
  assert.deepEqual(relativePaths, [path.join("latest", "download", "route.ts"), path.join("latest", "route.ts")]);
});

// ---------------------------------------------------------------------------
// DB-gated: generateWeeklyAnalysisIfNeeded's cache/invocation/persistence behavior.
// ---------------------------------------------------------------------------

const databaseConfigured = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const skip = databaseConfigured ? false : "DATABASE_URL/POSTGRES_URL not set -- no Postgres available in this environment.";
if (!databaseConfigured) {
  console.log("[weekly-report-analyst-service.test.cjs] SKIPPED: no DATABASE_URL/POSTGRES_URL configured.");
}

let pool;

test.before(async () => {
  if (!databaseConfigured) return;
  const { pathToFileURL } = require("node:url");
  const { runMigrations } = await import(pathToFileURL(path.resolve(__dirname, "../scripts/reports/migrate.mjs")).href);
  await runMigrations();
  const { getPool } = load("lib/persistence/db.ts");
  pool = getPool();
});

test.after(async () => {
  if (pool) await pool.end();
});

test.beforeEach(async () => {
  if (pool) await pool.query("TRUNCATE weekly_report_analyses, weekly_report_snapshots CASCADE");
});

async function insertSnapshot(overrides = {}) {
  const { createDraftSnapshot, transitionToBuilding, freezeSnapshot } = load("lib/reports/persistence/report-repo.ts");
  const draft = await createDraftSnapshot(pool, { storageWeekEnding: overrides.storageWeekEnding ?? "2026-08-28", schemaVersion: "1.0.0" });
  await transitionToBuilding(pool, draft.id);
  const ready = await freezeSnapshot(pool, draft.id, {
    dataCutoffAt: "2026-09-03T18:00:00.000Z",
    payload: { schemaVersion: "1.0.0", storageWeekEnding: draft.storageWeekEnding, dataCutoffAt: "2026-09-03T18:00:00.000Z", modules: {}, sourceManifest: { generatedFrom: [] } },
    inputFingerprint: overrides.inputFingerprint ?? "snapshot-fingerprint-a",
    sourceManifest: { generatedFrom: [] },
    readiness: { ready: true, missingRequired: [], degradedOptional: [] }
  });
  return ready;
}

function fakeInput() {
  return {
    schemaVersion: "1.0.0",
    report: { storageWeekEnding: "2026-08-28", dataCutoffAt: "2026-09-03T18:00:00.000Z" },
    marketBackdrop: [],
    riskCandidates: [],
    opportunityCandidates: [],
    whatChanged: [],
    range: [],
    peers: [],
    news: [],
    outlook: [],
    sourcesFreshness: [],
    previousReportContext: null,
    evidenceAllowlist: []
  };
}

function words(count) {
  return new Array(count).fill("word").join(" ");
}

function fakeAssessment(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    aiProvider: "fake",
    aiModel: "fake-model",
    generatedAt: new Date(0).toISOString(),
    executiveAssessment: words(200),
    biggestRisk: { title: "Risk", assessment: "Assessment.", evidenceIds: [] },
    biggestOpportunity: { title: "Opportunity", assessment: "Assessment.", evidenceIds: [] },
    whatChanged: [],
    managementWatchItems: [{ item: "Watch something", reason: "Because.", evidenceIds: [] }],
    bottomLine: "Bottom line.",
    selectedEvidenceIds: [],
    ...overrides
  };
}

function countingProvider({ failTimes = 0 } = {}) {
  let calls = 0;
  return {
    providerName: "fake",
    modelName: "fake-model",
    calls: () => calls,
    async analyze() {
      calls += 1;
      if (calls <= failTimes) throw new Error(`simulated provider failure #${calls}`);
      return fakeAssessment();
    }
  };
}

test("generateWeeklyAnalysisIfNeeded: exactly one provider call on a cache miss, persisted as 'generated'", { skip, timeout: 15_000 }, async () => {
  const { generateWeeklyAnalysisIfNeeded } = load("lib/reports/analyst-service.ts");
  const snapshot = await insertSnapshot();
  const provider = countingProvider();

  const result = await generateWeeklyAnalysisIfNeeded(pool, provider, fakeInput(), { snapshotId: snapshot.id, snapshotFingerprint: snapshot.inputFingerprint, schemaVersion: "1.0.0", model: "fake-model" });

  assert.equal(result.status, "generated");
  assert.equal(provider.calls(), 1);
  assert.equal(result.record.status, "ready");
  assert.equal(result.record.assessment.bottomLine, "Bottom line.");
});

test("generateWeeklyAnalysisIfNeeded: a cache hit never calls the provider", { skip, timeout: 15_000 }, async () => {
  const { generateWeeklyAnalysisIfNeeded } = load("lib/reports/analyst-service.ts");
  const snapshot = await insertSnapshot();
  const context = { snapshotId: snapshot.id, snapshotFingerprint: snapshot.inputFingerprint, schemaVersion: "1.0.0", model: "fake-model" };

  const firstProvider = countingProvider();
  const first = await generateWeeklyAnalysisIfNeeded(pool, firstProvider, fakeInput(), context);
  assert.equal(first.status, "generated");

  const secondProvider = countingProvider();
  const second = await generateWeeklyAnalysisIfNeeded(pool, secondProvider, fakeInput(), context);
  assert.equal(second.status, "cache_hit");
  assert.equal(secondProvider.calls(), 0, "the provider must never be invoked on a cache hit");
  assert.equal(second.record.id, first.record.id);
});

test("generateWeeklyAnalysisIfNeeded: a changed snapshot fingerprint (different snapshot) is not a cache hit -- generates a fresh analysis", { skip, timeout: 15_000 }, async () => {
  const { generateWeeklyAnalysisIfNeeded } = load("lib/reports/analyst-service.ts");
  const snapshotA = await insertSnapshot({ storageWeekEnding: "2026-08-28", inputFingerprint: "fp-a" });
  const snapshotB = await insertSnapshot({ storageWeekEnding: "2026-09-04", inputFingerprint: "fp-b" });

  const provider = countingProvider();
  await generateWeeklyAnalysisIfNeeded(pool, provider, fakeInput(), { snapshotId: snapshotA.id, snapshotFingerprint: snapshotA.inputFingerprint, schemaVersion: "1.0.0", model: "fake-model" });
  const second = await generateWeeklyAnalysisIfNeeded(pool, provider, fakeInput(), { snapshotId: snapshotB.id, snapshotFingerprint: snapshotB.inputFingerprint, schemaVersion: "1.0.0", model: "fake-model" });

  assert.equal(second.status, "generated");
  assert.equal(provider.calls(), 2);
});

test("generateWeeklyAnalysisIfNeeded: retries a transient provider failure within DEFAULT_ANALYSIS_RETRY_CONFIG, then succeeds", { skip, timeout: 15_000 }, async () => {
  const { generateWeeklyAnalysisIfNeeded } = load("lib/reports/analyst-service.ts");
  const snapshot = await insertSnapshot();
  const provider = countingProvider({ failTimes: 2 }); // fails twice, succeeds on the 3rd (bounded retry allows up to 3 attempts)

  const result = await generateWeeklyAnalysisIfNeeded(pool, provider, fakeInput(), { snapshotId: snapshot.id, snapshotFingerprint: snapshot.inputFingerprint, schemaVersion: "1.0.0", model: "fake-model" });

  assert.equal(result.status, "generated");
  assert.equal(provider.calls(), 3);
});

test("generateWeeklyAnalysisIfNeeded: a persistent provider failure is recorded as 'failed', never fabricates a fallback assessment", { skip, timeout: 15_000 }, async () => {
  const { generateWeeklyAnalysisIfNeeded } = load("lib/reports/analyst-service.ts");
  const snapshot = await insertSnapshot();
  const provider = countingProvider({ failTimes: 99 });

  const result = await generateWeeklyAnalysisIfNeeded(pool, provider, fakeInput(), { snapshotId: snapshot.id, snapshotFingerprint: snapshot.inputFingerprint, schemaVersion: "1.0.0", model: "fake-model" });

  assert.equal(result.status, "failed");
  assert.equal(result.record.status, "failed");
  assert.ok(result.record.errorMessage && result.record.errorMessage.length > 0);
  assert.equal(result.record.assessment, null);
});

test("generateWeeklyAnalysisIfNeeded: a failed attempt does not block or get overwritten by a later successful retry for the exact same fingerprint", { skip, timeout: 15_000 }, async () => {
  const { generateWeeklyAnalysisIfNeeded } = load("lib/reports/analyst-service.ts");
  const snapshot = await insertSnapshot();
  const context = { snapshotId: snapshot.id, snapshotFingerprint: snapshot.inputFingerprint, schemaVersion: "1.0.0", model: "fake-model" };

  const failingProvider = countingProvider({ failTimes: 99 });
  const failedResult = await generateWeeklyAnalysisIfNeeded(pool, failingProvider, fakeInput(), context);
  assert.equal(failedResult.status, "failed");

  const succeedingProvider = countingProvider();
  const retryResult = await generateWeeklyAnalysisIfNeeded(pool, succeedingProvider, fakeInput(), context);
  assert.equal(retryResult.status, "generated");
  assert.notEqual(retryResult.record.id, failedResult.record.id, "a retry after failure is a new row, not a resurrected one");

  const countResult = await pool.query("SELECT status, COUNT(*)::int AS count FROM weekly_report_analyses WHERE snapshot_id = $1 GROUP BY status", [snapshot.id]);
  const byStatus = Object.fromEntries(countResult.rows.map((row) => [row.status, row.count]));
  assert.equal(byStatus.failed, 1);
  assert.equal(byStatus.ready, 1);
});

test("generateWeeklyAnalysisIfNeeded: the DB-level uniqueness constraint prevents two 'ready' rows for the same fingerprint even via a raw insert", { skip, timeout: 15_000 }, async () => {
  const snapshot = await insertSnapshot();
  await pool.query(
    `INSERT INTO weekly_report_analyses (snapshot_id, analysis_fingerprint, status, schema_version, prompt_version, ai_provider, ai_model, assessment, completed_at)
     VALUES ($1, 'dupe-fp', 'ready', '1.0.0', '1.0.0', 'fake', 'fake-model', $2, now())`,
    [snapshot.id, JSON.stringify(fakeAssessment())]
  );
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO weekly_report_analyses (snapshot_id, analysis_fingerprint, status, schema_version, prompt_version, ai_provider, ai_model, assessment, completed_at)
         VALUES ($1, 'dupe-fp', 'ready', '1.0.0', '1.0.0', 'fake', 'fake-model', $2, now())`,
        [snapshot.id, JSON.stringify(fakeAssessment())]
      ),
    /duplicate key value violates unique constraint/
  );
});

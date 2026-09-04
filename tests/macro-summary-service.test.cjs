const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const databaseConfigured = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const skip = databaseConfigured ? false : "DATABASE_URL/POSTGRES_URL not set -- no Postgres available in this environment.";
if (!databaseConfigured) {
  console.log("[macro-summary-service.test.cjs] SKIPPED: no DATABASE_URL/POSTGRES_URL configured.");
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
  await pool.query("TRUNCATE macro_risk_summaries CASCADE");
});

test.after(async () => {
  if (pool) await pool.end();
});

test.beforeEach(async () => {
  if (pool) await pool.query("TRUNCATE macro_risk_summaries CASCADE");
});

function fakePayload(overrides = {}) {
  return { schemaVersion: "1.0.0", snapshotAsOf: "2026-08-14", signals: [], supportingMetrics: {}, ...overrides };
}

function countingProvider(summaryText = "Storage is elevated, a headwind for realized pricing; LNG demand growth is a partial offset. Henry Hub trend is roughly flat. IR should watch the next storage report and any STEO revision.") {
  let calls = 0;
  return {
    providerName: "fake",
    modelName: "fake-model",
    calls: () => calls,
    async summarize() {
      calls += 1;
      return { summary: summaryText, aiProvider: "fake", aiModel: "fake-model", schemaVersion: "1.0.0", generatedAt: new Date(0).toISOString() };
    }
  };
}

test("generateMacroSummaryIfNeeded calls the AI provider exactly once on a cache miss and persists the result", { skip }, async () => {
  const { generateMacroSummaryIfNeeded } = load("lib/market/macro-summary-service.ts");
  const { computeMacroSummaryFingerprint } = load("lib/market/persistence/summary-repo.ts");
  const payload = fakePayload();
  const fingerprint = computeMacroSummaryFingerprint(payload);
  const provider = countingProvider();

  const result = await generateMacroSummaryIfNeeded(pool, provider, payload, fingerprint);
  assert.equal(result.cacheHit, false);
  assert.equal(provider.calls(), 1);
  assert.equal(result.record.inputFingerprint, fingerprint);
});

test("generateMacroSummaryIfNeeded never calls the AI provider when a cached summary already exists for this fingerprint", { skip }, async () => {
  const { generateMacroSummaryIfNeeded } = load("lib/market/macro-summary-service.ts");
  const { computeMacroSummaryFingerprint, saveMacroSummary } = load("lib/market/persistence/summary-repo.ts");
  const payload = fakePayload();
  const fingerprint = computeMacroSummaryFingerprint(payload);
  await saveMacroSummary(pool, {
    inputFingerprint: fingerprint,
    summary: "Pre-existing cached summary.",
    riskSignals: payload,
    aiProvider: "anthropic",
    aiModel: "claude-haiku-4-5",
    schemaVersion: "1.0.0",
    generatedAt: "2026-08-20T12:00:00.000Z"
  });

  const provider = countingProvider();
  const result = await generateMacroSummaryIfNeeded(pool, provider, payload, fingerprint);

  assert.equal(result.cacheHit, true);
  assert.equal(provider.calls(), 0, "AI provider must never be called when a cache hit exists");
  assert.equal(result.record.summary, "Pre-existing cached summary.");
});

test("generateMacroSummaryIfNeeded passes the most recent prior (different-fingerprint) summary as change-detection context", { skip }, async () => {
  const { generateMacroSummaryIfNeeded } = load("lib/market/macro-summary-service.ts");
  const { computeMacroSummaryFingerprint, saveMacroSummary } = load("lib/market/persistence/summary-repo.ts");
  const oldPayload = fakePayload({ snapshotAsOf: "2026-08-01" });
  const oldFingerprint = computeMacroSummaryFingerprint(oldPayload);
  await saveMacroSummary(pool, {
    inputFingerprint: oldFingerprint,
    summary: "Old snapshot summary.",
    riskSignals: oldPayload,
    aiProvider: "anthropic",
    aiModel: "claude-haiku-4-5",
    schemaVersion: "1.0.0",
    generatedAt: "2026-08-01T12:00:00.000Z"
  });

  const newPayload = fakePayload({ snapshotAsOf: "2026-08-14" });
  const newFingerprint = computeMacroSummaryFingerprint(newPayload);
  let receivedPrior = "not-called";
  const provider = {
    providerName: "fake",
    modelName: "fake-model",
    async summarize(payload, priorSummary) {
      receivedPrior = priorSummary;
      return { summary: "New snapshot summary text long enough to pass validation easily here.", aiProvider: "fake", aiModel: "fake-model", schemaVersion: "1.0.0", generatedAt: new Date(0).toISOString() };
    }
  };

  await generateMacroSummaryIfNeeded(pool, provider, newPayload, newFingerprint);
  assert.equal(receivedPrior.summary, "Old snapshot summary.");
});

test("generateMacroSummaryIfNeeded retries a transient provider failure and succeeds on a later attempt", { skip }, async () => {
  const { generateMacroSummaryIfNeeded } = load("lib/market/macro-summary-service.ts");
  const { computeMacroSummaryFingerprint } = load("lib/market/persistence/summary-repo.ts");
  const payload = fakePayload();
  const fingerprint = computeMacroSummaryFingerprint(payload);

  let attempts = 0;
  const provider = {
    providerName: "fake",
    modelName: "fake-model",
    async summarize() {
      attempts += 1;
      if (attempts < 2) throw new Error("transient failure");
      return { summary: "Recovered after one retry, this text is long enough to pass validation.", aiProvider: "fake", aiModel: "fake-model", schemaVersion: "1.0.0", generatedAt: new Date(0).toISOString() };
    }
  };

  const result = await generateMacroSummaryIfNeeded(pool, provider, payload, fingerprint);
  assert.equal(attempts, 2);
  assert.equal(result.cacheHit, false);
  assert.match(result.record.summary, /Recovered after one retry/);
});

test("generateMacroSummaryIfNeeded propagates the error after exhausting bounded retries, never silently persists nothing as success", { skip }, async () => {
  const { generateMacroSummaryIfNeeded } = load("lib/market/macro-summary-service.ts");
  const { computeMacroSummaryFingerprint, getCachedMacroSummary } = load("lib/market/persistence/summary-repo.ts");
  const payload = fakePayload();
  const fingerprint = computeMacroSummaryFingerprint(payload);

  const provider = {
    providerName: "fake",
    modelName: "fake-model",
    async summarize() {
      throw new Error("permanently down");
    }
  };

  await assert.rejects(() => generateMacroSummaryIfNeeded(pool, provider, payload, fingerprint), /permanently down/);
  assert.equal(await getCachedMacroSummary(pool, fingerprint), null, "nothing must be persisted when generation ultimately fails");
});

test("generateMacroSummaryIfNeeded is idempotent under a race: two concurrent calls for the same fingerprint never store two different summaries", { skip }, async () => {
  const { generateMacroSummaryIfNeeded } = load("lib/market/macro-summary-service.ts");
  const { computeMacroSummaryFingerprint } = load("lib/market/persistence/summary-repo.ts");
  const payload = fakePayload();
  const fingerprint = computeMacroSummaryFingerprint(payload);

  const providerA = { providerName: "fake", modelName: "fake-model", async summarize() { return { summary: "Summary from caller A, long enough to pass the minimum word count check here.", aiProvider: "fake", aiModel: "fake-model", schemaVersion: "1.0.0", generatedAt: new Date(0).toISOString() }; } };
  const providerB = { providerName: "fake", modelName: "fake-model", async summarize() { return { summary: "Summary from caller B, long enough to pass the minimum word count check here.", aiProvider: "fake", aiModel: "fake-model", schemaVersion: "1.0.0", generatedAt: new Date(1).toISOString() }; } };

  const [resultA, resultB] = await Promise.all([
    generateMacroSummaryIfNeeded(pool, providerA, payload, fingerprint),
    generateMacroSummaryIfNeeded(pool, providerB, payload, fingerprint)
  ]);

  assert.equal(resultA.record.summary, resultB.record.summary, "both callers must agree on whichever summary actually persisted first");
});

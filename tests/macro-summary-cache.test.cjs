const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

/**
 * Requires a real Postgres reachable at DATABASE_URL/POSTGRES_URL. Proves
 * the AI Macro Summary caching *contract* (Sections 25/33) without any
 * actual AI provider/prompt code existing yet -- that's Phase 6D.
 */
const databaseConfigured = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const skip = databaseConfigured ? false : "DATABASE_URL/POSTGRES_URL not set -- no Postgres available in this environment.";

if (!databaseConfigured) {
  console.log("[macro-summary-cache.test.cjs] SKIPPED: no DATABASE_URL/POSTGRES_URL configured.");
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

const { computeMacroSummaryFingerprint } = load("lib/market/persistence/summary-repo.ts");

test("computeMacroSummaryFingerprint is deterministic for the same payload", () => {
  const payload = { henryHub: 3.5, storageVsFiveYear: -4.2, signals: ["storage", "lng"] };
  assert.equal(computeMacroSummaryFingerprint(payload), computeMacroSummaryFingerprint(payload));
});

test("computeMacroSummaryFingerprint is independent of object key order -- the same underlying signals always fingerprint the same way", () => {
  const a = computeMacroSummaryFingerprint({ henryHub: 3.5, storage: -4.2 });
  const b = computeMacroSummaryFingerprint({ storage: -4.2, henryHub: 3.5 });
  assert.equal(a, b);
});

test("computeMacroSummaryFingerprint changes when any underlying value changes", () => {
  const a = computeMacroSummaryFingerprint({ henryHub: 3.5, storage: -4.2 });
  const b = computeMacroSummaryFingerprint({ henryHub: 3.6, storage: -4.2 });
  assert.notEqual(a, b);
});

function summaryRecord(fingerprint, overrides = {}) {
  return {
    inputFingerprint: fingerprint,
    summary: "Storage is below the five-year average, a modestly supportive signal for Range.",
    riskSignals: { storageVsFiveYear: -4.2 },
    aiProvider: "anthropic",
    aiModel: "claude-haiku-4-5",
    schemaVersion: "1.0.0",
    generatedAt: "2026-08-20T12:00:00.000Z",
    ...overrides
  };
}

test("getCachedMacroSummary returns null when no summary has ever been saved for a fingerprint", { skip }, async () => {
  const { getCachedMacroSummary } = load("lib/market/persistence/summary-repo.ts");
  const result = await getCachedMacroSummary(pool, "never-saved-fingerprint");
  assert.equal(result, null);
});

test("saveMacroSummary then getCachedMacroSummary round-trips the exact record", { skip }, async () => {
  const { saveMacroSummary, getCachedMacroSummary } = load("lib/market/persistence/summary-repo.ts");
  const fingerprint = computeMacroSummaryFingerprint({ henryHub: 3.5 });
  const { inserted } = await saveMacroSummary(pool, summaryRecord(fingerprint));
  assert.equal(inserted, true);

  const cached = await getCachedMacroSummary(pool, fingerprint);
  assert.equal(cached.summary, "Storage is below the five-year average, a modestly supportive signal for Range.");
  assert.equal(cached.aiModel, "claude-haiku-4-5");
  assert.deepEqual(cached.riskSignals, { storageVsFiveYear: -4.2 });
});

test("saving a summary twice for the same fingerprint is a no-op the second time -- an unchanged snapshot must never regenerate or duplicate a summary", { skip }, async () => {
  const { saveMacroSummary, getCachedMacroSummary } = load("lib/market/persistence/summary-repo.ts");
  const fingerprint = computeMacroSummaryFingerprint({ henryHub: 3.5 });
  const first = await saveMacroSummary(pool, summaryRecord(fingerprint, { summary: "First summary." }));
  const second = await saveMacroSummary(pool, summaryRecord(fingerprint, { summary: "A different summary that must never be written." }));

  assert.equal(first.inserted, true);
  assert.equal(second.inserted, false, "the second save for the same fingerprint must be recognized as a no-op");

  const cached = await getCachedMacroSummary(pool, fingerprint);
  assert.equal(cached.summary, "First summary.", "the original cached summary must survive, not be overwritten");
});

test("two different fingerprints (different underlying signals) cache independently", { skip }, async () => {
  const { saveMacroSummary, getCachedMacroSummary } = load("lib/market/persistence/summary-repo.ts");
  const fingerprintA = computeMacroSummaryFingerprint({ henryHub: 3.5 });
  const fingerprintB = computeMacroSummaryFingerprint({ henryHub: 4.0 });
  await saveMacroSummary(pool, summaryRecord(fingerprintA, { summary: "Summary A." }));
  await saveMacroSummary(pool, summaryRecord(fingerprintB, { summary: "Summary B." }));

  assert.equal((await getCachedMacroSummary(pool, fingerprintA)).summary, "Summary A.");
  assert.equal((await getCachedMacroSummary(pool, fingerprintB)).summary, "Summary B.");
});

test("getLatestMacroSummary returns null when no summary has ever been saved", { skip }, async () => {
  const { getLatestMacroSummary } = load("lib/market/persistence/summary-repo.ts");
  assert.equal(await getLatestMacroSummary(pool), null);
});

test("getLatestMacroSummary returns the most recently generated summary regardless of fingerprint -- the Section 17 stale-fallback source", { skip }, async () => {
  const { saveMacroSummary, getLatestMacroSummary } = load("lib/market/persistence/summary-repo.ts");
  const fingerprintA = computeMacroSummaryFingerprint({ henryHub: 3.5 });
  const fingerprintB = computeMacroSummaryFingerprint({ henryHub: 4.0 });
  await saveMacroSummary(pool, summaryRecord(fingerprintA, { summary: "Older summary.", generatedAt: "2026-08-10T12:00:00.000Z" }));
  await saveMacroSummary(pool, summaryRecord(fingerprintB, { summary: "Newer summary.", generatedAt: "2026-08-20T12:00:00.000Z" }));

  const latest = await getLatestMacroSummary(pool);
  assert.equal(latest.summary, "Newer summary.");
});

test("getPreviousMacroSummary returns null (never a fabricated placeholder) until at least two distinct snapshots exist", { skip }, async () => {
  const { saveMacroSummary, getPreviousMacroSummary } = load("lib/market/persistence/summary-repo.ts");
  const fingerprintA = computeMacroSummaryFingerprint({ henryHub: 3.5 });
  await saveMacroSummary(pool, summaryRecord(fingerprintA, { summary: "Only summary." }));
  assert.equal(await getPreviousMacroSummary(pool, fingerprintA), null);
});

test("getPreviousMacroSummary returns the most recent summary strictly before the excluded fingerprint -- real persisted history, the 'what changed' comparison source", { skip }, async () => {
  const { saveMacroSummary, getPreviousMacroSummary } = load("lib/market/persistence/summary-repo.ts");
  const fingerprintA = computeMacroSummaryFingerprint({ henryHub: 3.5 });
  const fingerprintB = computeMacroSummaryFingerprint({ henryHub: 4.0 });
  await saveMacroSummary(pool, summaryRecord(fingerprintA, { summary: "First snapshot.", generatedAt: "2026-08-10T12:00:00.000Z" }));
  await saveMacroSummary(pool, summaryRecord(fingerprintB, { summary: "Second snapshot.", generatedAt: "2026-08-20T12:00:00.000Z" }));

  const previous = await getPreviousMacroSummary(pool, fingerprintB);
  assert.equal(previous.summary, "First snapshot.");
});

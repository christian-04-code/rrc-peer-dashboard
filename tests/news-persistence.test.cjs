const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

/**
 * Requires a real Postgres reachable at DATABASE_URL/POSTGRES_URL. No Docker
 * or local Postgres was available in the Phase 2 implementation environment
 * (verified: `docker --version` -> command not found; no local `psql`/
 * `postgres` binary), and the Phase 2 directive is explicit: do not install
 * or start another DB service to work around that. These tests therefore
 * skip -- loudly, not silently -- whenever no DATABASE_URL is configured,
 * and should be run for real (locally, in CI, or manually against a
 * provisioned Neon/Vercel Postgres instance) before Phase 3 begins.
 */
const databaseConfigured = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const skip = databaseConfigured ? false : "DATABASE_URL/POSTGRES_URL not set -- no Postgres available in this environment (see comment above).";

if (!databaseConfigured) {
  console.log("[news-persistence.test.cjs] SKIPPED: no DATABASE_URL/POSTGRES_URL configured. Set one against a real Postgres to run these tests.");
}

let pool;

test.before(async () => {
  if (!databaseConfigured) return;
  const path = require("node:path");
  const { pathToFileURL } = require("node:url");
  const { runMigrations } = await import(pathToFileURL(path.resolve(__dirname, "../scripts/news/migrate.mjs")).href);
  await runMigrations();
  const { getPool } = load("lib/persistence/db.ts");
  pool = getPool();
  await pool.query("TRUNCATE articles, pipeline_runs CASCADE");
});

test.after(async () => {
  if (pool) await pool.end();
});

function sampleArticle(overrides) {
  return {
    fingerprint: "fp-1",
    canonicalUrl: "https://example.com/story",
    normalizedUrl: "https://example.com/story",
    headline: "Range Resources reports strong Marcellus production",
    normalizedHeadline: "range resources reports strong marcellus production",
    publisher: "Example Wire",
    originalSource: "test-source",
    publishedAt: "2026-08-15T09:00:00.000Z",
    retrievedAt: "2026-08-15T10:00:00.000Z",
    sourceTier: "tier2_major_news",
    excerpt: null,
    relevance: { score: 9, retained: true, matchedEntities: [{ ticker: "RRC", label: "Range Resources", kind: "company_name" }], matchedKeywords: ["marcellus"], rejectionReason: null },
    category: { categories: ["range", "appalachia"], reasoning: { range: ["x"], appalachia: ["x"] } },
    ...overrides
  };
}

test("creating and completing a pipeline run persists its accounting fields", { skip }, async () => {
  const { createPipelineRun, completePipelineRun, getPipelineRun } = load("lib/news/persistence/pipeline-runs-repo.ts");
  const startedAt = new Date().toISOString();
  const runId = await createPipelineRun(pool, startedAt);
  assert.ok(runId);

  await completePipelineRun(pool, runId, {
    status: "completed",
    sourcesAttempted: 3,
    sourcesSuccessful: 3,
    sourceFailures: [],
    articlesDiscovered: 10,
    duplicatesRemoved: 2,
    articlesRejected: 5,
    articlesRetained: 3,
    aiAnalysesAttempted: 0,
    aiAnalysesCompleted: 0,
    errors: [],
    completedAt: new Date().toISOString()
  });

  const row = await getPipelineRun(pool, runId);
  assert.equal(row.status, "completed");
  assert.equal(row.articles_retained, 3);
});

test("inserting an article twice is idempotent -- the second insert is a no-op, not a duplicate row", { skip }, async () => {
  const { insertArticleIfNew } = load("lib/news/persistence/articles-repo.ts");
  const { createPipelineRun } = load("lib/news/persistence/pipeline-runs-repo.ts");
  const runId = await createPipelineRun(pool, new Date().toISOString());

  const article = sampleArticle({ fingerprint: "idempotency-fp", normalizedUrl: "https://example.com/idempotency-story", canonicalUrl: "https://example.com/idempotency-story" });

  const first = await insertArticleIfNew(pool, article, "retained", runId);
  assert.equal(first.inserted, true);

  const second = await insertArticleIfNew(pool, article, "retained", runId);
  assert.equal(second.inserted, false, "re-inserting the identical fingerprint/URL must not create a second row");

  const count = await pool.query("SELECT count(*)::int AS n FROM articles WHERE fingerprint = $1", ["idempotency-fp"]);
  assert.equal(count.rows[0].n, 1);
});

test("queryArticles filters by category and returns the persisted Phase 2 fields", { skip }, async () => {
  const { insertArticleIfNew, queryArticles } = load("lib/news/persistence/articles-repo.ts");
  const { createPipelineRun } = load("lib/news/persistence/pipeline-runs-repo.ts");
  const runId = await createPipelineRun(pool, new Date().toISOString());

  const article = sampleArticle({ fingerprint: "query-fp", normalizedUrl: "https://example.com/query-story", canonicalUrl: "https://example.com/query-story" });
  await insertArticleIfNew(pool, article, "retained", runId);

  const results = await queryArticles(pool, { category: "range" });
  assert.ok(results.some((a) => a.fingerprint === "query-fp"));
  const match = results.find((a) => a.fingerprint === "query-fp");
  assert.equal(match.processingStatus, "retained");
  assert.deepEqual(match.category.sort(), ["appalachia", "range"]);
});

test("a repeat end-to-end pipeline run against the same source data retains zero new articles the second time", { skip }, async () => {
  const { runNewsPipeline } = load("lib/news/pipeline/runner.ts");
  const adapter = {
    id: "idempotency-source",
    tier: "tier2_major_news",
    label: "idempotency-source",
    async collect() {
      return [
        {
          sourceId: "idempotency-source",
          sourceTier: "tier2_major_news",
          headline: "EQT announces new pipeline agreement",
          url: "https://example.com/pipeline-run-idempotency-story",
          publisher: "Example Wire",
          publishedAt: new Date().toISOString(),
          excerpt: "EQT expands Appalachian takeaway capacity."
        }
      ];
    }
  };

  const first = await runNewsPipeline({ adapters: [adapter], persist: true });
  assert.equal(first.articlesRetained, 1);

  const second = await runNewsPipeline({ adapters: [adapter], persist: true });
  assert.equal(second.articlesRetained, 0, "the second run must recognize the article as already stored");
  assert.ok(second.duplicatesRemoved >= 1);
});

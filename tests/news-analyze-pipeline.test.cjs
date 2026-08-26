const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

/**
 * Requires a real Postgres reachable at DATABASE_URL/POSTGRES_URL, same
 * convention as tests/news-persistence.test.cjs -- these skip loudly, not
 * silently, when unavailable.
 */
const databaseConfigured = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const skip = databaseConfigured ? false : "DATABASE_URL/POSTGRES_URL not set -- no Postgres available in this environment.";

if (!databaseConfigured) {
  console.log("[news-analyze-pipeline.test.cjs] SKIPPED: no DATABASE_URL/POSTGRES_URL configured.");
}

let pool;

test.before(async () => {
  if (!databaseConfigured) return;
  const path = require("node:path");
  const { pathToFileURL } = require("node:url");
  const { runMigrations } = await import(pathToFileURL(path.resolve(__dirname, "../scripts/news/migrate.mjs")).href);
  await runMigrations();
  const { getPool } = load("lib/news/persistence/db.ts");
  pool = getPool();
  await pool.query("TRUNCATE articles, pipeline_runs CASCADE");
});

test.after(async () => {
  if (pool) await pool.end();
});

test.beforeEach(async () => {
  if (pool) await pool.query("TRUNCATE articles, pipeline_runs CASCADE");
});

function scoredArticle(overrides) {
  const { normalizeRawArticle } = load("lib/news/normalize/normalize.ts");
  const { scoreRelevance } = load("lib/news/relevance/score.ts");
  const { classifyCategories } = load("lib/news/category/classify.ts");

  const normalized = normalizeRawArticle(
    {
      sourceId: "analyze-test",
      sourceTier: "tier1_primary",
      headline: "Range Resources Corporation reports strong Marcellus production",
      url: `https://example.com/analyze-test/${Math.random().toString(36).slice(2)}`,
      publisher: "Example Wire",
      publishedAt: new Date().toISOString(),
      excerpt: "Range highlighted continued Appalachian production strength.",
      ...overrides
    },
    new Date().toISOString()
  );
  const relevance = scoreRelevance(normalized);
  const category = classifyCategories(normalized, relevance.matchedEntities);
  return { ...normalized, relevance, category };
}

async function insertRunAndArticle(status, overrides) {
  const { createPipelineRun } = load("lib/news/persistence/pipeline-runs-repo.ts");
  const { insertArticleIfNew } = load("lib/news/persistence/articles-repo.ts");
  const runId = await createPipelineRun(pool, new Date().toISOString());
  const article = scoredArticle(overrides);
  const result = await insertArticleIfNew(pool, article, status, runId);
  return { runId, articleId: result.id, article };
}

function mockAnalysisResult(overrides) {
  return {
    summary: "Range Resources reported strong Marcellus production.",
    rangeImpact: "positive",
    impactStrength: "medium",
    affectedDrivers: ["gas_pricing"],
    rangeAnalysis: "This could potentially support Range's near-term realized pricing.",
    timeHorizon: "near_term",
    confidence: 0.7,
    aiProvider: "mock",
    aiModel: "mock-model",
    impactFrameworkVersion: "1.0.0",
    analysisSchemaVersion: "1.0.0",
    analyzedAt: new Date().toISOString(),
    ...overrides
  };
}

function alwaysSucceedsProvider(overrides) {
  return {
    providerName: "mock-success",
    modelName: "mock-model",
    async analyze() {
      return mockAnalysisResult(overrides);
    }
  };
}

function alwaysFailsProvider(message) {
  return {
    providerName: "mock-failure",
    modelName: "mock-model",
    async analyze() {
      throw new Error(message ?? "mock provider failure");
    }
  };
}

test("getRetainedUnanalyzedArticles only returns 'retained' articles, never rejected/duplicate/analyzed ones", { skip }, async () => {
  const { getRetainedUnanalyzedArticles } = load("lib/news/persistence/articles-repo.ts");
  await insertRunAndArticle("retained", { url: "https://example.com/eligible-1" });
  await insertRunAndArticle("rejected_relevance", { url: "https://example.com/rejected-1" });
  await insertRunAndArticle("analyzed", { url: "https://example.com/already-analyzed-1" });

  const sinceIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const eligible = await getRetainedUnanalyzedArticles(pool, { limit: 10, sinceIso });

  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].headline, "Range Resources Corporation reports strong Marcellus production");
});

test("analyzeEligibleArticles: a successful analysis persists validated fields and flips status to 'analyzed'", { skip }, async () => {
  const { analyzeEligibleArticles } = load("lib/news/pipeline/analyze.ts");
  const { queryArticles } = load("lib/news/persistence/articles-repo.ts");
  const { articleId } = await insertRunAndArticle("retained", { url: "https://example.com/analyze-success" });

  const summary = await analyzeEligibleArticles(pool, alwaysSucceedsProvider({}), { maxArticles: 5 });

  assert.equal(summary.eligibleFound, 1);
  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 0);

  // Filtered by the known articleId rather than trusting an unscoped
  // "status = analyzed" query to return only this test's row -- this table
  // is shared with other DB-gated test files that may run concurrently.
  const analyzedRows = await queryArticles(pool, { status: "analyzed", limit: 200 });
  const row = analyzedRows.find((r) => r.id === articleId);
  assert.ok(row, "the analyzed article must be findable by its known id");
  assert.equal(row.rangeImpact, "positive");
  assert.equal(row.aiProvider, "mock");
  assert.equal(row.impactFrameworkVersion, "1.0.0");
});

test("analyzeEligibleArticles: a persistently-failing provider marks the article 'analysis_failed' without deleting it or fabricating analysis", { skip }, async () => {
  const { analyzeEligibleArticles } = load("lib/news/pipeline/analyze.ts");
  const { queryArticles } = load("lib/news/persistence/articles-repo.ts");
  const { articleId } = await insertRunAndArticle("retained", { url: "https://example.com/analyze-failure" });

  const summary = await analyzeEligibleArticles(pool, alwaysFailsProvider("provider is down"), { maxArticles: 5 });

  assert.equal(summary.completed, 0);
  assert.equal(summary.failed, 1);
  // A plain Error (not AiAnalysisValidationError/NewsAnalysisProviderError) is
  // deliberately reduced to its error name only -- see safeErrorMessage in
  // lib/news/pipeline/analyze.ts -- so the raw provider message is not
  // expected to survive into the reported error.
  assert.ok(summary.errors.some((e) => e.includes("Analysis failed (Error)")));

  const failedRows = await queryArticles(pool, { status: "analysis_failed", limit: 200 });
  const row = failedRows.find((r) => r.id === articleId);
  assert.ok(row, "the failed article must be findable by its known id");
  assert.equal(row.aiSummary, null, "a failed analysis must never write fabricated AI fields");
});

test("analyzeEligibleArticles: one article failing does not abort the batch -- others still get analyzed", { skip }, async () => {
  const { analyzeEligibleArticles } = load("lib/news/pipeline/analyze.ts");
  await insertRunAndArticle("retained", { url: "https://example.com/batch-fail" });
  await insertRunAndArticle("retained", { url: "https://example.com/batch-succeed", headline: "EQT Corporation announces pipeline expansion" });

  // Keyed by headline (not a shared call counter) so the bounded-retry
  // wrapper's internal retries on the failing article never "leak" into
  // making the second, distinct article's first attempt look like a retry.
  const mixedProvider = {
    providerName: "mixed",
    modelName: "mock-model",
    async analyze(input) {
      if (input.headline.includes("EQT Corporation")) return mockAnalysisResult({});
      throw new Error("this article always fails, even after retries");
    }
  };

  const summary = await analyzeEligibleArticles(pool, mixedProvider, { maxArticles: 5 });
  assert.equal(summary.attempted, 2);
  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 1);
});

test("analyzeEligibleArticles never re-analyzes an already-analyzed article (no duplicate analysis)", { skip }, async () => {
  const { analyzeEligibleArticles } = load("lib/news/pipeline/analyze.ts");
  await insertRunAndArticle("analyzed", { url: "https://example.com/already-done" });
  await insertRunAndArticle("retained", { url: "https://example.com/needs-analysis", headline: "EQT Corporation announces pipeline expansion" });

  const summary = await analyzeEligibleArticles(pool, alwaysSucceedsProvider({}), { maxArticles: 5 });
  assert.equal(summary.eligibleFound, 1, "only the retained (not the already-analyzed) article should be eligible");
});

test("analyzeEligibleArticles enforces the requested article cap even when more are eligible", { skip }, async () => {
  const { analyzeEligibleArticles } = load("lib/news/pipeline/analyze.ts");
  for (let i = 0; i < 4; i += 1) {
    await insertRunAndArticle("retained", { url: `https://example.com/cap-test-${i}`, headline: `EQT Corporation update number ${i}` });
  }

  const summary = await analyzeEligibleArticles(pool, alwaysSucceedsProvider({}), { maxArticles: 2 });
  assert.equal(summary.eligibleFound, 2, "the query itself must be capped, not just post-filtered");
  assert.equal(summary.completed, 2);
});

test("a provider satisfying the NewsAnalysisProvider interface (not Anthropic-specific) works with analyzeEligibleArticles -- proves the pipeline is provider-agnostic", { skip }, async () => {
  const { analyzeEligibleArticles } = load("lib/news/pipeline/analyze.ts");
  await insertRunAndArticle("retained", { url: "https://example.com/provider-agnostic" });

  const customProvider = alwaysSucceedsProvider({ aiProvider: "some-other-vendor", aiModel: "some-other-model" });
  const summary = await analyzeEligibleArticles(pool, customProvider, { maxArticles: 5 });
  assert.equal(summary.completed, 1);
  assert.equal(summary.results[0].headline.length > 0, true);
});

test("pipelineRunId scoping: only articles from the specified run are eligible, even when other runs have retained articles too", { skip }, async () => {
  const { analyzeEligibleArticles } = load("lib/news/pipeline/analyze.ts");
  const { runId: otherRunId } = await insertRunAndArticle("retained", { url: "https://example.com/other-run-article" });
  const { runId: targetRunId } = await insertRunAndArticle("retained", {
    url: "https://example.com/target-run-article",
    headline: "EQT Corporation announces pipeline expansion"
  });
  assert.notEqual(otherRunId, targetRunId);

  const summary = await analyzeEligibleArticles(pool, alwaysSucceedsProvider({}), { maxArticles: 5, pipelineRunId: targetRunId });
  assert.equal(summary.eligibleFound, 1, "an article from a different pipeline run must not be selected");
  assert.equal(summary.results[0].headline, "EQT Corporation announces pipeline expansion");
});

test("AI run accounting persists onto the pipeline_runs row when pipelineRunId is supplied", { skip }, async () => {
  const { analyzeEligibleArticles } = load("lib/news/pipeline/analyze.ts");
  const { getPipelineRun } = load("lib/news/persistence/pipeline-runs-repo.ts");
  const { runId } = await insertRunAndArticle("retained", { url: "https://example.com/accounting-test" });

  await analyzeEligibleArticles(pool, alwaysSucceedsProvider({}), { maxArticles: 5, pipelineRunId: runId });

  const runRow = await getPipelineRun(pool, runId);
  assert.equal(runRow.ai_analyses_attempted, 1);
  assert.equal(runRow.ai_analyses_completed, 1);
});

test("scopeArticlesToRun: false (Phase 5 scheduled orchestration) picks up a retained article left over from a different, earlier pipeline run", { skip }, async () => {
  const { analyzeEligibleArticles } = load("lib/news/pipeline/analyze.ts");
  const { runId: staleRunId, articleId: staleArticleId } = await insertRunAndArticle("retained", { url: "https://example.com/stale-retained-from-earlier-run" });
  const { runId: currentRunId } = await insertRunAndArticle("retained", {
    url: "https://example.com/current-run-article",
    headline: "EQT Corporation announces pipeline expansion"
  });
  assert.notEqual(staleRunId, currentRunId);

  // A scoped call (the manual-validation default) must not see the stale article.
  const scoped = await analyzeEligibleArticles(pool, alwaysSucceedsProvider({}), { maxArticles: 5, pipelineRunId: currentRunId });
  assert.equal(scoped.eligibleFound, 1, "scoped analysis must only see the current run's own article");

  // An unscoped call (Phase 5) must still find the stale article left in
  // 'retained' by the earlier run, since no future run's own runId would
  // ever match it under the old scoped-only behavior.
  const unscoped = await analyzeEligibleArticles(pool, alwaysSucceedsProvider({}), {
    maxArticles: 5,
    pipelineRunId: currentRunId,
    scopeArticlesToRun: false
  });
  assert.ok(
    unscoped.results.some((r) => r.articleId === staleArticleId),
    "the stale retained article from an earlier run must be eligible when scopeArticlesToRun is false"
  );
});

test("scopeArticlesToRun: false still writes AI accounting onto the current run's pipeline_runs row (accounting and article scope are independent)", { skip }, async () => {
  const { analyzeEligibleArticles } = load("lib/news/pipeline/analyze.ts");
  const { getPipelineRun } = load("lib/news/persistence/pipeline-runs-repo.ts");
  const { runId: currentRunId } = await insertRunAndArticle("retained", { url: "https://example.com/unscoped-accounting" });

  await analyzeEligibleArticles(pool, alwaysSucceedsProvider({}), { maxArticles: 5, pipelineRunId: currentRunId, scopeArticlesToRun: false });

  const runRow = await getPipelineRun(pool, currentRunId);
  assert.equal(runRow.ai_analyses_attempted, 1);
  assert.equal(runRow.ai_analyses_completed, 1);
});

test("saveArticleAnalysis is a no-op if the article's status is no longer 'retained' -- idempotency enforced at the write, not just the earlier read", { skip }, async () => {
  const { saveArticleAnalysis, queryArticles } = load("lib/news/persistence/articles-repo.ts");
  const { articleId } = await insertRunAndArticle("analyzed", { url: "https://example.com/already-analyzed-guard" });

  await saveArticleAnalysis(pool, articleId, mockAnalysisResult({ summary: "This must never be written." }));

  const rows = await queryArticles(pool, { status: "analyzed", limit: 200 });
  const row = rows.find((r) => r.id === articleId);
  assert.ok(row, "the article must still exist and still report as analyzed");
  assert.notEqual(row.aiSummary, "This must never be written.");
});

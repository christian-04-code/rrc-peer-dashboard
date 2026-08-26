const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

/**
 * Requires a real Postgres reachable at DATABASE_URL/POSTGRES_URL, same
 * convention as tests/news-analyze-pipeline.test.cjs -- these skip loudly,
 * not silently, when unavailable.
 */
const databaseConfigured = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const skip = databaseConfigured ? false : "DATABASE_URL/POSTGRES_URL not set -- no Postgres available in this environment.";

if (!databaseConfigured) {
  console.log("[news-orchestration.test.cjs] SKIPPED: no DATABASE_URL/POSTGRES_URL configured.");
}

const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

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
  if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
});

test.beforeEach(async () => {
  if (pool) await pool.query("TRUNCATE articles, pipeline_runs CASCADE");
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
});

function loadOrchestrate() {
  delete require.cache[require.resolve("../lib/news/pipeline/orchestrate.ts")];
  return load("lib/news/pipeline/orchestrate.ts");
}

function rangeArticle(overrides) {
  return {
    sourceId: "orchestration-test",
    sourceTier: "tier1_primary",
    headline: "Range Resources Corporation reports strong Marcellus production",
    url: `https://example.com/orchestration-test/${Math.random().toString(36).slice(2)}`,
    publisher: "Example Wire",
    publishedAt: new Date().toISOString(),
    excerpt: "Range highlighted continued Appalachian production strength.",
    ...overrides
  };
}

function irrelevantArticle(overrides) {
  return {
    sourceId: "orchestration-test",
    sourceTier: "tier2_major_news",
    headline: "Local bakery wins county fair blue ribbon",
    url: `https://example.com/orchestration-test/${Math.random().toString(36).slice(2)}`,
    publisher: "Example Wire",
    publishedAt: new Date().toISOString(),
    excerpt: null,
    ...overrides
  };
}

function workingAdapter(id, articles) {
  return { id, tier: "tier1_primary", label: id, async collect() { return articles; } };
}

function failingAdapter(id, message) {
  return { id, tier: "tier3_discovery", label: id, async collect() { throw new Error(message); } };
}

function trackingProvider(analyzedHeadlines) {
  return {
    providerName: "mock",
    modelName: "mock-model",
    async analyze(input) {
      analyzedHeadlines.push(input.headline);
      return {
        summary: "Mock summary.",
        rangeImpact: "positive",
        impactStrength: "medium",
        affectedDrivers: ["gas_pricing"],
        rangeAnalysis: "Mock analysis.",
        timeHorizon: "near_term",
        confidence: 0.7,
        aiProvider: "mock",
        aiModel: "mock-model",
        impactFrameworkVersion: "1.0.0",
        analysisSchemaVersion: "1.0.0",
        analyzedAt: new Date().toISOString()
      };
    }
  };
}

test("runs the pipeline then analyzes exactly the articles that run retained -- rejected articles never reach the provider", { skip }, async () => {
  const { runDailyNewsOrchestration } = loadOrchestrate();
  const analyzed = [];
  const adapter = workingAdapter("mixed", [rangeArticle({}), irrelevantArticle({})]);

  const result = await runDailyNewsOrchestration({ adapters: [adapter], provider: trackingProvider(analyzed) });

  assert.equal(result.concurrentRunSkipped, false);
  assert.equal(result.articlesRetained, 1);
  assert.equal(result.articlesRejected, 1);
  assert.equal(result.aiAnalysesAttempted, 1, "only the retained article should reach analysis");
  assert.equal(result.aiAnalysesCompleted, 1);
  assert.equal(analyzed.length, 1);
  assert.match(analyzed[0], /Range Resources/, "the rejected bakery article must never be sent to the provider");
});

test("duplicate scheduled execution does not re-analyze (and does not re-charge) an already-analyzed article", { skip }, async () => {
  const { runDailyNewsOrchestration } = loadOrchestrate();
  const analyzed = [];
  const url = "https://example.com/orchestration-duplicate-run";
  const adapter = workingAdapter("dup-source", [rangeArticle({ url })]);

  const first = await runDailyNewsOrchestration({ adapters: [adapter], provider: trackingProvider(analyzed) });
  assert.equal(first.aiAnalysesCompleted, 1);

  // Second scheduled invocation "discovers" the same story again (same
  // source, same URL) -- exactly what a real repeat daily run looks like.
  const second = await runDailyNewsOrchestration({ adapters: [adapter], provider: trackingProvider(analyzed) });

  assert.equal(second.duplicatesRemoved >= 1, true, "the second run must recognize the article as already stored");
  assert.equal(second.aiAnalysesAttempted, 0, "no eligible (retained-but-unanalyzed) article exists on the second run");
  assert.equal(analyzed.length, 1, "the provider must only ever have been called once across both runs");
});

test("the AI hard cap (PIPELINE_CONFIG.maxAiAnalysesPerRun) is enforced even when more articles are retained", { skip }, async () => {
  const { PIPELINE_CONFIG } = load("lib/news/pipeline/config.ts");
  const { runDailyNewsOrchestration } = loadOrchestrate();
  const analyzed = [];
  const capPlusOne = PIPELINE_CONFIG.maxAiAnalysesPerRun + 1;
  const articles = Array.from({ length: capPlusOne }, (_, i) =>
    rangeArticle({ headline: `Range Resources Corporation update number ${i}`, url: `https://example.com/cap-${i}` })
  );
  const adapter = workingAdapter("cap-source", articles);

  const result = await runDailyNewsOrchestration({ adapters: [adapter], provider: trackingProvider(analyzed) });

  assert.ok(result.articlesRetained >= capPlusOne || result.articlesRetained === capPlusOne, "sanity: articles were retained");
  assert.ok(result.aiAnalysesAttempted <= PIPELINE_CONFIG.maxAiAnalysesPerRun, "AI analysis must never exceed the configured hard cap");
  assert.ok(analyzed.length <= PIPELINE_CONFIG.maxAiAnalysesPerRun);
});

test("one failed source does not prevent AI analysis of articles from the other, successful sources", { skip }, async () => {
  const { runDailyNewsOrchestration } = loadOrchestrate();
  const analyzed = [];
  const good = workingAdapter("good-source", [rangeArticle({ url: "https://example.com/source-isolation-good" })]);
  const bad = failingAdapter("bad-source", "upstream timed out");

  const result = await runDailyNewsOrchestration({ adapters: [good, bad], provider: trackingProvider(analyzed) });

  assert.equal(result.sourcesSuccessful, 1);
  assert.equal(result.sourceFailures.length, 1);
  assert.equal(result.aiAnalysesCompleted, 1, "the good source's article must still be analyzed despite the other source failing");
});

test("pipeline run accounting persists ai_analyses_attempted/completed/failed correctly, including a partial-failure run", { skip }, async () => {
  const { runDailyNewsOrchestration } = loadOrchestrate();
  const { getPipelineRun } = load("lib/news/persistence/pipeline-runs-repo.ts");
  const succeeds = rangeArticle({ headline: "Range Resources Corporation announces pipeline update", url: "https://example.com/accounting-succeed" });
  const fails = rangeArticle({ headline: "Range Resources Corporation announces well results", url: "https://example.com/accounting-fail" });
  const adapter = workingAdapter("accounting-source", [succeeds, fails]);

  const mixedProvider = {
    providerName: "mixed",
    modelName: "mock-model",
    async analyze(input) {
      if (input.headline.includes("well results")) throw new Error("provider failure");
      return {
        summary: "ok",
        rangeImpact: "neutral",
        impactStrength: "low",
        affectedDrivers: ["gas_pricing"],
        rangeAnalysis: "ok",
        timeHorizon: "near_term",
        confidence: 0.5,
        aiProvider: "mock",
        aiModel: "mock-model",
        impactFrameworkVersion: "1.0.0",
        analysisSchemaVersion: "1.0.0",
        analyzedAt: new Date().toISOString()
      };
    }
  };

  const result = await runDailyNewsOrchestration({ adapters: [adapter], provider: mixedProvider });
  assert.equal(result.aiAnalysesAttempted, 2);
  assert.equal(result.aiAnalysesCompleted, 1);
  assert.equal(result.aiAnalysesFailed, 1);

  const row = await getPipelineRun(pool, result.runId);
  assert.equal(row.ai_analyses_attempted, 2);
  assert.equal(row.ai_analyses_completed, 1);
  assert.equal(row.ai_analyses_failed, 1);
});

test("a second concurrent invocation is skipped via the advisory lock, not run in parallel against the same eligible articles", { skip }, async () => {
  const { runDailyNewsOrchestration } = loadOrchestrate();
  const { Client } = require("pg");
  const { getDatabaseUrl } = load("lib/news/persistence/db.ts");

  // A dedicated Client (its own physical connection/session), not a query
  // through the shared Pool -- session-level advisory locks are reentrant
  // *within* a session, so acquiring via the same pooled connection the
  // orchestration would reuse could let it "re-acquire its own lock" and
  // falsely appear unlocked. A separate session is what a genuinely
  // overlapping second cron invocation would actually look like.
  const lockClient = new Client({ connectionString: getDatabaseUrl(), ssl: process.env.NEWS_DB_SSL === "true" ? { rejectUnauthorized: false } : undefined });
  await lockClient.connect();
  await lockClient.query("SELECT pg_advisory_lock(hashtext('rrc_news_daily_orchestration')::bigint)");
  try {
    const result = await runDailyNewsOrchestration({ adapters: [workingAdapter("s", [])] });
    assert.equal(result.concurrentRunSkipped, true);
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock(hashtext('rrc_news_daily_orchestration')::bigint)");
    await lockClient.end();
  }
});

test("a provider that fails every article is still handled per-article (marked analysis_failed, batch continues) -- never crashes the orchestration", { skip }, async () => {
  const { runDailyNewsOrchestration } = loadOrchestrate();
  const adapter = workingAdapter("throwing-provider-source", [rangeArticle({ url: "https://example.com/ai-stage-throws" })]);
  const throwingProvider = {
    providerName: "throws",
    modelName: "mock-model",
    async analyze() {
      throw new Error("Connection string: postgres://user:supersecret@host/db");
    }
  };

  const result = await runDailyNewsOrchestration({ adapters: [adapter], provider: throwingProvider });
  assert.equal(result.status, "completed", "the deterministic pipeline stage must still succeed even if every AI analysis fails");
  assert.equal(result.aiAnalysesAttempted, 1);
  assert.equal(result.aiAnalysesFailed, 1);
  assert.equal(result.aiSkippedReason, null, "a per-article failure is not a skipped AI stage -- analysis was attempted and accounted for");
});

test("orchestrate.ts never interpolates a raw caught error into the AI-stage-skipped reason -- verified by source inspection", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../lib/news/pipeline/orchestrate.ts"), "utf8");
  assert.doesNotMatch(
    source,
    /aiSkippedReason\s*=\s*`[^`]*\$\{error(?!.*safeErrorMessage)/,
    "aiSkippedReason must only ever be built from safeErrorMessage(error), never a raw ${error...} interpolation"
  );
  assert.match(source, /aiSkippedReason = `AI analysis stage did not complete: \$\{safeErrorMessage\(error\)\}`/);
});

test("AI analysis is gracefully skipped (not a thrown error) when ANTHROPIC_API_KEY is not configured", { skip }, async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { runDailyNewsOrchestration } = loadOrchestrate();
  const adapter = workingAdapter("no-key-source", [rangeArticle({ url: "https://example.com/no-anthropic-key" })]);

  const result = await runDailyNewsOrchestration({ adapters: [adapter] });
  assert.equal(result.status, "completed");
  assert.equal(result.aiAnalysesAttempted, 0);
  assert.match(result.aiSkippedReason, /ANTHROPIC_API_KEY/);
});

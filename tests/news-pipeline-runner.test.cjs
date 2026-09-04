const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

function loadRunner() {
  delete require.cache[require.resolve("../lib/news/pipeline/runner.ts")];
  return load("lib/news/pipeline/runner.ts");
}

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalPostgresUrl = process.env.POSTGRES_URL;

function ensureNoDatabaseConfigured() {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
}

function restoreEnv() {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = originalPostgresUrl;
}

test.beforeEach(ensureNoDatabaseConfigured);
test.after(restoreEnv);

function workingAdapter(id, articles) {
  return {
    id,
    tier: "tier2_major_news",
    label: id,
    async collect() {
      return articles;
    }
  };
}

function failingAdapter(id, message) {
  return {
    id,
    tier: "tier3_discovery",
    label: id,
    async collect() {
      throw new Error(message);
    }
  };
}

function sampleArticle(overrides) {
  return {
    sourceId: "src",
    sourceTier: "tier2_major_news",
    headline: "Range Resources reports strong Marcellus production",
    url: "https://example.com/story",
    publisher: "Example Wire",
    publishedAt: "2026-08-15T09:00:00.000Z",
    excerpt: null,
    ...overrides
  };
}

test("one failing source adapter does not abort the pipeline run -- the other sources still contribute", async () => {
  const { runNewsPipeline } = loadRunner();
  const good = workingAdapter("good-source", [sampleArticle({})]);
  const bad = failingAdapter("bad-source", "upstream timed out");

  const result = await runNewsPipeline({ adapters: [good, bad], persist: false });

  assert.equal(result.sourcesAttempted, 2);
  assert.equal(result.sourcesSuccessful, 1);
  assert.equal(result.sourceFailures.length, 1);
  assert.equal(result.sourceFailures[0].sourceId, "bad-source");
  assert.match(result.sourceFailures[0].error, /upstream timed out/);
  assert.equal(result.status, "completed_with_errors");
  assert.ok(result.articlesDiscovered >= 1, "the working source's article must still be counted");
});

test("a source adapter that returns zero articles is a success, not a failure", async () => {
  const { runNewsPipeline } = loadRunner();
  const empty = workingAdapter("empty-source", []);

  const result = await runNewsPipeline({ adapters: [empty], persist: false });
  assert.equal(result.sourcesSuccessful, 1);
  assert.equal(result.sourceFailures.length, 0);
  assert.equal(result.status, "completed");
});

test("pipeline-run accounting: discovered, duplicates removed, rejected, and retained counts are internally consistent", async () => {
  const { runNewsPipeline } = loadRunner();
  const relevant = sampleArticle({ headline: "Range Resources reports strong Marcellus production", url: "https://example.com/relevant" });
  const duplicateOfRelevant = sampleArticle({
    headline: "Range Resources reports strong Marcellus production",
    url: "https://example.com/relevant?utm_source=syndication"
  });
  const irrelevant = sampleArticle({ headline: "Local bakery wins county fair blue ribbon", url: "https://example.com/irrelevant", excerpt: null });

  const adapter = workingAdapter("mixed-source", [relevant, duplicateOfRelevant, irrelevant]);
  const result = await runNewsPipeline({ adapters: [adapter], persist: false });

  assert.equal(result.articlesDiscovered, 3);
  assert.equal(result.duplicatesRemoved, 1);
  assert.equal(result.articlesRetained + result.articlesRejected, result.articlesDiscovered - result.duplicatesRemoved);
  assert.equal(result.articlesRetained, 1);
  assert.equal(result.articlesRejected, 1);
  assert.equal(result.retainedArticles[0].headline, "Range Resources reports strong Marcellus production");
});

test("a malformed article from one source is skipped and recorded, without failing the run", async () => {
  const { runNewsPipeline } = loadRunner();
  const malformed = sampleArticle({ headline: "" });
  const valid = sampleArticle({ url: "https://example.com/valid-story" });
  const adapter = workingAdapter("mixed-quality-source", [malformed, valid]);

  const result = await runNewsPipeline({ adapters: [adapter], persist: false });
  assert.equal(result.articlesDiscovered, 2);
  assert.ok(result.errors.some((e) => /Skipped malformed article/.test(e)));
});

test("every pipeline run returns a runId even without a database configured", async () => {
  const { runNewsPipeline } = loadRunner();
  const result = await runNewsPipeline({ adapters: [workingAdapter("s", [])], persist: false });
  assert.ok(typeof result.runId === "string" && result.runId.length > 0);
});

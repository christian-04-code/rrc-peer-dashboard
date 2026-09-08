const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { normalizeRawArticle, ArticleValidationError } = load("lib/news/normalize/normalize.ts");

function raw(overrides) {
  return {
    sourceId: "test-source",
    sourceTier: "tier2_major_news",
    headline: "A valid headline",
    url: "https://example.com/story",
    publisher: "Example Wire",
    publishedAt: "2026-08-15T09:00:00.000Z",
    excerpt: "An excerpt.",
    ...overrides
  };
}

test("rejects an article with a missing headline instead of inventing one", () => {
  assert.throws(() => normalizeRawArticle(raw({ headline: "" }), "2026-08-15T10:00:00.000Z"), ArticleValidationError);
});

test("rejects an article with a missing URL", () => {
  assert.throws(() => normalizeRawArticle(raw({ url: "" }), "2026-08-15T10:00:00.000Z"), ArticleValidationError);
});

test("rejects an article with an invalid (non-absolute) URL", () => {
  assert.throws(() => normalizeRawArticle(raw({ url: "not-a-url" }), "2026-08-15T10:00:00.000Z"), ArticleValidationError);
});

test("rejects an article with a missing publisher", () => {
  assert.throws(() => normalizeRawArticle(raw({ publisher: "" }), "2026-08-15T10:00:00.000Z"), ArticleValidationError);
});

test("preserves a missing/unparseable publication timestamp as null rather than inventing one", () => {
  const withMissingDate = normalizeRawArticle(raw({ publishedAt: null }), "2026-08-15T10:00:00.000Z");
  assert.equal(withMissingDate.publishedAt, null);

  const withGarbageDate = normalizeRawArticle(raw({ publishedAt: "not-a-real-date" }), "2026-08-15T10:00:00.000Z");
  assert.equal(withGarbageDate.publishedAt, null);
});

test("preserves a missing excerpt as null rather than inventing summary text", () => {
  const result = normalizeRawArticle(raw({ excerpt: null }), "2026-08-15T10:00:00.000Z");
  assert.equal(result.excerpt, null);
});

test("a valid article normalizes with retrievedAt stamped from the caller, not the source", () => {
  const retrievedAt = "2026-08-15T10:00:00.000Z";
  const result = normalizeRawArticle(raw({}), retrievedAt);
  assert.equal(result.retrievedAt, retrievedAt);
  assert.equal(result.headline, "A valid headline");
  assert.equal(result.originalSource, "test-source");
});

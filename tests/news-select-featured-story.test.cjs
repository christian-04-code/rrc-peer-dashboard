const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { selectFeaturedNaturalGasStory } = load("lib/news/select-featured-story.ts");

function article(overrides) {
  return {
    id: "id",
    canonicalUrl: "https://example.com/article",
    headline: "A natural gas headline",
    publisher: "Example Wire",
    publishedAt: "2026-09-20T12:00:00.000Z",
    sourceTier: "tier2_major_news",
    excerpt: null,
    category: ["natural_gas"],
    relevanceScore: 50,
    matchedKeywords: [],
    matchedEntities: [],
    processingStatus: "retained",
    aiSummary: null,
    rangeImpact: null,
    impactStrength: null,
    affectedDrivers: null,
    rangeAnalysis: null,
    timeHorizon: null,
    confidence: null,
    aiProvider: null,
    aiModel: null,
    aiAnalyzedAt: null,
    impactFrameworkVersion: null,
    analysisSchemaVersion: null,
    ...overrides
  };
}

test("returns null when there are no articles at all", () => {
  assert.equal(selectFeaturedNaturalGasStory(null), null);
  assert.equal(selectFeaturedNaturalGasStory([]), null);
});

test("only considers articles tagged natural_gas -- never a peers/appalachia-only story", () => {
  const articles = [article({ id: "a", category: ["appalachia"] }), article({ id: "b", category: ["peers"] })];
  assert.equal(selectFeaturedNaturalGasStory(articles), null);
});

test("excludes articles News itself rejected or hasn't finished collecting", () => {
  const articles = [
    article({ id: "rejected", processingStatus: "rejected_relevance" }),
    article({ id: "collected", processingStatus: "collected" }),
    article({ id: "failed", processingStatus: "analysis_failed" })
  ];
  assert.equal(selectFeaturedNaturalGasStory(articles), null);
});

test("accepts both retained and analyzed articles", () => {
  assert.equal(selectFeaturedNaturalGasStory([article({ id: "r", processingStatus: "retained" })]).id, "r");
  assert.equal(selectFeaturedNaturalGasStory([article({ id: "a", processingStatus: "analyzed" })]).id, "a");
});

test("picks the most recently published qualifying article, never an older one", () => {
  const articles = [
    article({ id: "older", publishedAt: "2026-09-10T00:00:00.000Z" }),
    article({ id: "newer", publishedAt: "2026-09-20T00:00:00.000Z" }),
    article({ id: "middle", publishedAt: "2026-09-15T00:00:00.000Z" })
  ];
  assert.equal(selectFeaturedNaturalGasStory(articles).id, "newer");
});

test("breaks a same-timestamp tie by the higher relevance score, deterministically", () => {
  const articles = [
    article({ id: "low", publishedAt: "2026-09-20T00:00:00.000Z", relevanceScore: 10 }),
    article({ id: "high", publishedAt: "2026-09-20T00:00:00.000Z", relevanceScore: 90 })
  ];
  assert.equal(selectFeaturedNaturalGasStory(articles).id, "high");
});

test("an article with no publishedAt is never preferred over one with a real date", () => {
  const articles = [
    article({ id: "undated", publishedAt: null, relevanceScore: 100 }),
    article({ id: "dated", publishedAt: "2026-09-01T00:00:00.000Z", relevanceScore: 1 })
  ];
  assert.equal(selectFeaturedNaturalGasStory(articles).id, "dated");
});

test("never fabricates a headline or URL -- returns the article's own persisted fields unmodified", () => {
  const source = article({ id: "real", headline: "Real EIA-sourced headline", canonicalUrl: "https://real-publisher.example.com/story" });
  const result = selectFeaturedNaturalGasStory([source]);
  assert.equal(result.headline, "Real EIA-sourced headline");
  assert.equal(result.canonicalUrl, "https://real-publisher.example.com/story");
});

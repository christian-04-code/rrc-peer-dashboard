const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { isDisplayableStatus, selectDisplayableArticles, filterArticles, formatArticleDate, impactSymbol, rangeImpactTone } = load(
  "lib/news/article-display.ts"
);

function article(overrides) {
  return {
    id: "id-1",
    canonicalUrl: "https://example.com/story",
    headline: "Headline",
    publisher: "Example Wire",
    publishedAt: "2026-08-21T09:00:00.000Z",
    sourceTier: "tier2_major_news",
    excerpt: "Excerpt",
    category: ["natural_gas"],
    relevanceScore: 10,
    matchedKeywords: [],
    matchedEntities: [],
    processingStatus: "analyzed",
    aiSummary: null,
    rangeImpact: "positive",
    impactStrength: "medium",
    affectedDrivers: ["gas_pricing"],
    rangeAnalysis: null,
    timeHorizon: "near_term",
    confidence: 0.6,
    aiProvider: null,
    aiModel: null,
    aiAnalyzedAt: null,
    impactFrameworkVersion: null,
    analysisSchemaVersion: null,
    ...overrides
  };
}

test("isDisplayableStatus: retained/analyzed/analysis_failed are displayable", () => {
  assert.equal(isDisplayableStatus("retained"), true);
  assert.equal(isDisplayableStatus("analyzed"), true);
  assert.equal(isDisplayableStatus("analysis_failed"), true);
});

test("isDisplayableStatus: internal pipeline states are never displayable", () => {
  assert.equal(isDisplayableStatus("collected"), false);
  assert.equal(isDisplayableStatus("rejected_relevance"), false);
  assert.equal(isDisplayableStatus("rejected_duplicate"), false);
});

test("selectDisplayableArticles filters out internal-status rows without touching displayable ones", () => {
  const input = [
    article({ id: "a", processingStatus: "analyzed" }),
    article({ id: "b", processingStatus: "rejected_relevance" }),
    article({ id: "c", processingStatus: "retained" }),
    article({ id: "d", processingStatus: "collected" }),
    article({ id: "e", processingStatus: "analysis_failed" })
  ];
  const result = selectDisplayableArticles(input);
  assert.deepEqual(
    result.map((a) => a.id),
    ["a", "c", "e"]
  );
});

test("filterArticles: category 'all' returns everything", () => {
  const input = [article({ category: ["natural_gas"] }), article({ category: ["lng"] })];
  assert.equal(filterArticles(input, { category: "all", impact: "all", strength: "all" }).length, 2);
});

test("filterArticles: category filter matches multi-category articles by inclusion, not equality", () => {
  const input = [article({ id: "a", category: ["range", "appalachia"] }), article({ id: "b", category: ["lng"] })];
  const result = filterArticles(input, { category: "appalachia", impact: "all", strength: "all" });
  assert.deepEqual(result.map((a) => a.id), ["a"]);
});

test("filterArticles: impact filter", () => {
  const input = [article({ id: "a", rangeImpact: "positive" }), article({ id: "b", rangeImpact: "negative" })];
  const result = filterArticles(input, { category: "all", impact: "negative", strength: "all" });
  assert.deepEqual(result.map((a) => a.id), ["b"]);
});

test("filterArticles: strength filter", () => {
  const input = [article({ id: "a", impactStrength: "low" }), article({ id: "b", impactStrength: "high" })];
  const result = filterArticles(input, { category: "all", impact: "all", strength: "high" });
  assert.deepEqual(result.map((a) => a.id), ["b"]);
});

test("filterArticles: combined filters apply as AND, not OR", () => {
  const input = [
    article({ id: "a", category: ["lng"], rangeImpact: "positive", impactStrength: "high" }),
    article({ id: "b", category: ["lng"], rangeImpact: "negative", impactStrength: "high" }),
    article({ id: "c", category: ["ngl"], rangeImpact: "positive", impactStrength: "high" })
  ];
  const result = filterArticles(input, { category: "lng", impact: "positive", strength: "high" });
  assert.deepEqual(result.map((a) => a.id), ["a"]);
});

test("filterArticles: an unanalyzed article (null rangeImpact) is excluded once an impact filter is active", () => {
  const input = [article({ id: "a", processingStatus: "retained", rangeImpact: null, impactStrength: null })];
  const result = filterArticles(input, { category: "all", impact: "positive", strength: "all" });
  assert.equal(result.length, 0);
});

test("formatArticleDate: formats a valid ISO timestamp", () => {
  assert.match(formatArticleDate("2026-08-21T09:00:00.000Z"), /2026/);
});

test("formatArticleDate: null and invalid dates both render as 'Undated', never a fabricated date", () => {
  assert.equal(formatArticleDate(null), "Undated");
  assert.equal(formatArticleDate("not-a-date"), "Undated");
});

test("impactSymbol: uses a distinct, non-color-dependent symbol per direction", () => {
  const positive = impactSymbol("positive");
  const negative = impactSymbol("negative");
  const neutral = impactSymbol("neutral");
  assert.notEqual(positive, negative);
  assert.notEqual(positive, neutral);
  assert.notEqual(negative, neutral);
});

test("rangeImpactTone: positive impact at medium or high strength is 'positive'", () => {
  assert.equal(rangeImpactTone({ rangeImpact: "positive", impactStrength: "medium" }), "positive");
  assert.equal(rangeImpactTone({ rangeImpact: "positive", impactStrength: "high" }), "positive");
});

test("rangeImpactTone: negative impact at medium or high strength is 'negative'", () => {
  assert.equal(rangeImpactTone({ rangeImpact: "negative", impactStrength: "medium" }), "negative");
  assert.equal(rangeImpactTone({ rangeImpact: "negative", impactStrength: "high" }), "negative");
});

test("rangeImpactTone: an explicitly 'neutral' AI impact is always 'caution', regardless of strength", () => {
  assert.equal(rangeImpactTone({ rangeImpact: "neutral", impactStrength: "high" }), "caution");
  assert.equal(rangeImpactTone({ rangeImpact: "neutral", impactStrength: "low" }), "caution");
});

test("rangeImpactTone: a low-strength positive or negative call is downgraded to 'caution', not shown as a strong directional signal", () => {
  assert.equal(rangeImpactTone({ rangeImpact: "positive", impactStrength: "low" }), "caution");
  assert.equal(rangeImpactTone({ rangeImpact: "negative", impactStrength: "low" }), "caution");
});

test("rangeImpactTone: a directional impact with a missing/malformed strength defensively falls back to 'caution', never a fabricated direction", () => {
  assert.equal(rangeImpactTone({ rangeImpact: "positive", impactStrength: null }), "caution");
  assert.equal(rangeImpactTone({ rangeImpact: "negative", impactStrength: null }), "caution");
});

test("rangeImpactTone: no AI result yet (unanalyzed or analysis_failed, rangeImpact null) is 'neutral' -- never fabricates a color", () => {
  assert.equal(rangeImpactTone({ rangeImpact: null, impactStrength: null }), "neutral");
});

test("rangeImpactTone: uses only the existing categorical rangeImpact/impactStrength fields -- verified by source inspection to never reference a numeric confidence threshold", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../lib/news/article-display.ts"), "utf8");
  const fnMatch = source.match(/export function rangeImpactTone\([\s\S]*?\n}/);
  assert.ok(fnMatch, "expected to find the rangeImpactTone function body");
  assert.doesNotMatch(fnMatch[0], /confidence/i, "rangeImpactTone must not invent a numeric confidence cutoff");
});

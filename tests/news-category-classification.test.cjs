const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { normalizeRawArticle } = load("lib/news/normalize/normalize.ts");
const { classifyCategories } = load("lib/news/category/classify.ts");
const { scoreRelevance } = load("lib/news/relevance/score.ts");

function classify(headline, excerpt) {
  const normalized = normalizeRawArticle(
    {
      sourceId: "test-source",
      sourceTier: "tier2_major_news",
      headline,
      url: `https://example.com/${encodeURIComponent(headline)}`,
      publisher: "Example Wire",
      publishedAt: "2026-08-15T09:00:00.000Z",
      excerpt: excerpt ?? null
    },
    "2026-08-15T10:00:00.000Z"
  );
  const relevance = scoreRelevance(normalized);
  return classifyCategories(normalized, relevance.matchedEntities);
}

test("classifies an RRC article under 'range'", () => {
  const result = classify("Range Resources Corporation reports Q2 results");
  assert.ok(result.categories.includes("range"));
  assert.ok(result.reasoning.range.length > 0);
});

test("classifies a peer-company article under 'peers', not 'range'", () => {
  const result = classify("EQT Corporation announces pipeline expansion");
  assert.ok(result.categories.includes("peers"));
  assert.ok(!result.categories.includes("range"));
});

test("classifies natural gas macro coverage", () => {
  const result = classify("Henry Hub prices climb on colder outlook", "Natural gas storage fell below the 5-year average.");
  assert.ok(result.categories.includes("natural_gas"));
});

test("classifies LNG coverage", () => {
  const result = classify("Gulf Coast LNG terminal reaches final investment decision");
  assert.ok(result.categories.includes("lng"));
});

test("classifies Appalachia coverage", () => {
  const result = classify("Marcellus takeaway capacity set to expand next year");
  assert.ok(result.categories.includes("appalachia"));
});

test("classifies power/data center coverage", () => {
  const result = classify("PJM warns of rising data center power demand");
  assert.ok(result.categories.includes("power_data_centers"));
});

test("classifies NGL coverage", () => {
  const result = classify("Propane exports climb as Mont Belvieu prices firm");
  assert.ok(result.categories.includes("ngl"));
});

test("classifies regulatory coverage", () => {
  const result = classify("FERC approves new methane regulation for pipelines");
  assert.ok(result.categories.includes("regulatory"));
});

test("an article can carry multiple categories at once", () => {
  const result = classify(
    "Range Resources highlights Appalachian takeaway gains amid LNG demand growth",
    "The company cited Marcellus basis improvement and rising Gulf Coast LNG feedgas demand."
  );
  assert.ok(result.categories.includes("range"));
  assert.ok(result.categories.includes("appalachia"));
  assert.ok(result.categories.includes("lng"));
  assert.ok(result.categories.length >= 3);
});

test("reasoning is recorded for every assigned category, for debugging", () => {
  const result = classify("Marcellus takeaway capacity set to expand next year");
  for (const category of result.categories) {
    assert.ok(result.reasoning[category].length > 0, `expected reasoning entries for category "${category}"`);
  }
});

test("an article matching nothing gets no categories", () => {
  const result = classify("Local bakery wins county fair blue ribbon");
  assert.equal(result.categories.length, 0);
});

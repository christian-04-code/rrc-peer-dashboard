const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { normalizeRawArticle } = load("lib/news/normalize/normalize.ts");
const { scoreRelevance } = load("lib/news/relevance/score.ts");

function article(overrides) {
  return normalizeRawArticle(
    {
      sourceId: "test-source",
      sourceTier: "tier1_primary",
      headline: "Range Resources reports strong Marcellus production",
      url: "https://example.com/story",
      publisher: "Example Wire",
      publishedAt: "2026-08-15T09:00:00.000Z",
      excerpt: null,
      ...overrides
    },
    "2026-08-15T10:00:00.000Z"
  );
}

test("a strongly on-topic article (company + region keyword) is retained with a positive score", () => {
  const result = scoreRelevance(article({}));
  assert.equal(result.retained, true);
  assert.ok(result.score > 0);
  assert.ok(result.matchedEntities.some((e) => e.ticker === "RRC"));
});

test("an article with no matched entities or keywords is rejected with a clear reason", () => {
  const result = scoreRelevance(
    article({ headline: "Local bakery wins county fair blue ribbon", excerpt: "The bakery has entered the contest for ten years." })
  );
  assert.equal(result.retained, false);
  assert.equal(result.score, 0);
  assert.match(result.rejectionReason, /No relevant entities or topics matched/);
});

test("a topic-only match (no company entity) can still be retained on strong topic weight, e.g. Appalachia + LNG", () => {
  const result = scoreRelevance(
    article({
      headline: "Marcellus producers eye new LNG feedgas contracts",
      excerpt: "Appalachian basin gas increasingly flows toward Gulf Coast LNG export terminals."
    })
  );
  assert.equal(result.retained, true);
  assert.ok(result.matchedKeywords.length > 0);
});

test("source tier contributes a small bonus only when the article already has some relevance signal", () => {
  const tier1 = scoreRelevance(article({ sourceTier: "tier1_primary" }));
  const tier3 = scoreRelevance(article({ sourceTier: "tier3_discovery" }));
  assert.ok(tier1.score >= tier3.score, "a higher-authority source should never score lower for an otherwise identical article");

  const irrelevantTier1 = scoreRelevance(article({ sourceTier: "tier1_primary", headline: "Weather forecast for the weekend", excerpt: null }));
  assert.equal(irrelevantTier1.score, 0, "source tier alone must never manufacture relevance for an off-topic article");
});

test("matchedKeywords surfaces the specific topic phrases that drove the score, for auditability", () => {
  const result = scoreRelevance(
    article({ headline: "Henry Hub prices rise on colder forecasts", excerpt: "Natural gas storage fell below the 5-year average." })
  );
  assert.ok(result.matchedKeywords.includes("henry hub"));
});

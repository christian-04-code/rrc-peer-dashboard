const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const cardSource = fs.readFileSync(path.join(process.cwd(), "components", "news", "ArticleCard.tsx"), "utf8");
const drawerSource = fs.readFileSync(path.join(process.cwd(), "components", "news", "NewsDetailDrawer.tsx"), "utf8");

test("ArticleCard labels the factual section and the AI section with distinct, explicit wording", () => {
  assert.match(cardSource, />Factual Summary</);
  assert.match(cardSource, />AI Range Analysis</);
});

test("NewsDetailDrawer labels the factual section and the AI section with distinct, explicit wording", () => {
  assert.match(drawerSource, /<h3>Factual Summary<\/h3>/);
  assert.match(drawerSource, /<h3>AI Range Analysis<\/h3>/);
});

test("the AI section carries a distinguishing CSS hook (news-ai-label) separate from the factual section", () => {
  assert.match(cardSource, /news-ai-label/);
  assert.match(drawerSource, /news-ai-label/);
});

test("ArticleCard never renders excerpt text under the AI-analysis label, and never renders rangeAnalysis under the factual label", () => {
  // The factual block renders article.excerpt; the AI block renders article.rangeAnalysis -- assert they are not swapped.
  const factualBlockMatch = cardSource.match(/Factual Summary<\/h4>\s*<p className="news-card-excerpt">\{([^}]+)\}/);
  const aiBlockMatch = cardSource.match(/news-card-analysis">\{([^}]+)\}/);
  assert.ok(factualBlockMatch, "expected the factual block to render a specific expression");
  assert.ok(aiBlockMatch, "expected the AI block to render a specific expression");
  assert.match(factualBlockMatch[1], /excerpt/);
  assert.match(aiBlockMatch[1], /rangeAnalysis/);
  assert.doesNotMatch(factualBlockMatch[1], /rangeAnalysis/);
  assert.doesNotMatch(aiBlockMatch[1], /excerpt/);
});

test("confidence is presented with restrained, non-trading language -- a tooltip clarifies it is not a stock-price signal", () => {
  assert.match(cardSource, /Confidence reflects confidence in the inferred business impact on Range, not expected stock-price direction\./);
  assert.doesNotMatch(cardSource, /probability of/i);
  assert.doesNotMatch(cardSource, /expected return/i);
  assert.doesNotMatch(cardSource, /price target/i);
  assert.doesNotMatch(cardSource, /buy|sell signal/i);
});

test("ArticleCard shows 'Analysis Pending' for retained-but-unanalyzed articles and 'Analysis Unavailable' for failed analyses, without fabricating replacement content", () => {
  assert.match(cardSource, />Analysis Pending</);
  assert.match(cardSource, />Analysis Unavailable</);
});

test("driver keys and time-horizon values are always passed through a label function before rendering, never interpolated raw", () => {
  assert.doesNotMatch(cardSource, /\{article\.timeHorizon\}/, "raw snake_case timeHorizon must not be rendered directly");
  assert.doesNotMatch(cardSource, /\{article\.affectedDrivers\.join/, "raw driver keys must not be joined/rendered without driverLabel");
  assert.match(cardSource, /timeHorizonLabel\(article\.timeHorizon\)/);
  assert.match(cardSource, /driverLabel\(/);
});

test("View Original only renders when a canonical URL exists, and is never fabricated", () => {
  assert.match(cardSource, /\{article\.canonicalUrl \? \(/);
  assert.match(cardSource, /View Original/);
});

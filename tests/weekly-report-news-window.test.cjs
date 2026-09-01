const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { computeNewsWindow, selectWeeklyNews, NEWS_WINDOW_DAYS, NEWS_WINDOW_MAX_ITEMS } = load("lib/reports/news-window.ts");

function article(overrides) {
  return {
    id: "id",
    canonicalUrl: "https://example.com",
    normalizedUrl: "example.com",
    fingerprint: "fp",
    headline: "Headline",
    normalizedHeadline: "headline",
    publisher: "Publisher",
    originalSource: "Publisher",
    publishedAt: "2026-08-25T00:00:00.000Z",
    retrievedAt: "2026-08-25T00:00:00.000Z",
    sourceTier: "tier1_primary",
    excerpt: null,
    category: ["range"],
    relevanceScore: 0.5,
    matchedEntities: [],
    matchedKeywords: [],
    processingStatus: "analyzed",
    pipelineRunId: null,
    aiSummary: null,
    rangeImpact: "positive",
    impactStrength: "medium",
    affectedDrivers: ["gas_pricing"],
    rangeAnalysis: null,
    timeHorizon: null,
    confidence: 0.8,
    aiProvider: "anthropic",
    aiModel: "claude",
    aiAnalyzedAt: "2026-08-25T01:00:00.000Z",
    impactFrameworkVersion: "1.0.0",
    analysisSchemaVersion: "1.0.0",
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    ...overrides
  };
}

test("computeNewsWindow: spans exactly NEWS_WINDOW_DAYS calendar days (start-of-day through end-of-day), ending at the storage week's own Friday", () => {
  const window = computeNewsWindow("2026-08-28");
  assert.equal(window.end.slice(0, 10), "2026-08-28");
  assert.equal(window.start, "2026-08-22T00:00:00.000Z", "start = storageWeekEnding - (NEWS_WINDOW_DAYS - 1) days, at 00:00:00");
  // The measured span between start-of-day-1 and end-of-day-7 is just under NEWS_WINDOW_DAYS full days (23:59:59.999 short of it), not exactly NEWS_WINDOW_DAYS - 1.
  const spanDays = (new Date(window.end).getTime() - new Date(window.start).getTime()) / 86_400_000;
  assert.ok(Math.abs(spanDays - NEWS_WINDOW_DAYS) < 0.01);
});

test("selectWeeklyNews: excludes an article published before the window", () => {
  const window = computeNewsWindow("2026-08-28");
  const outside = article({ id: "outside", publishedAt: "2026-08-01T00:00:00.000Z" });
  assert.deepEqual(selectWeeklyNews([outside], window), []);
});

test("selectWeeklyNews: excludes an article published after the window (future relative to the report's own week)", () => {
  const window = computeNewsWindow("2026-08-28");
  const future = article({ id: "future", publishedAt: "2026-09-05T00:00:00.000Z" });
  assert.deepEqual(selectWeeklyNews([future], window), []);
});

test("selectWeeklyNews: excludes an article that is not status 'analyzed', even if it falls inside the window -- never fabricates its analysis", () => {
  const window = computeNewsWindow("2026-08-28");
  const pending = article({ id: "pending", processingStatus: "retained", publishedAt: "2026-08-25T00:00:00.000Z" });
  assert.deepEqual(selectWeeklyNews([pending], window), []);
});

test("selectWeeklyNews: includes an eligible in-window analyzed article", () => {
  const window = computeNewsWindow("2026-08-28");
  const eligible = article({ id: "eligible", publishedAt: "2026-08-25T00:00:00.000Z" });
  const selected = selectWeeklyNews([eligible], window);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, "eligible");
});

test("selectWeeklyNews: ranks 'high' impact strength before 'medium' before 'low'", () => {
  const window = computeNewsWindow("2026-08-28");
  const low = article({ id: "low", impactStrength: "low", publishedAt: "2026-08-25T00:00:00.000Z" });
  const high = article({ id: "high", impactStrength: "high", publishedAt: "2026-08-25T00:00:00.000Z" });
  const medium = article({ id: "medium", impactStrength: "medium", publishedAt: "2026-08-25T00:00:00.000Z" });
  const selected = selectWeeklyNews([low, high, medium], window);
  assert.deepEqual(selected.map((a) => a.id), ["high", "medium", "low"]);
});

test("selectWeeklyNews: within the same impact strength, higher relevanceScore ranks first", () => {
  const window = computeNewsWindow("2026-08-28");
  const lowRelevance = article({ id: "low-rel", relevanceScore: 0.2, publishedAt: "2026-08-25T00:00:00.000Z" });
  const highRelevance = article({ id: "high-rel", relevanceScore: 0.9, publishedAt: "2026-08-25T00:00:00.000Z" });
  const selected = selectWeeklyNews([lowRelevance, highRelevance], window);
  assert.deepEqual(selected.map((a) => a.id), ["high-rel", "low-rel"]);
});

test("selectWeeklyNews: caps at NEWS_WINDOW_MAX_ITEMS even when more are eligible", () => {
  const window = computeNewsWindow("2026-08-28");
  const many = Array.from({ length: NEWS_WINDOW_MAX_ITEMS + 5 }, (_, i) => article({ id: `a${i}`, publishedAt: "2026-08-25T00:00:00.000Z" }));
  const selected = selectWeeklyNews(many, window);
  assert.equal(selected.length, NEWS_WINDOW_MAX_ITEMS);
});

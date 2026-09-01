const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { computeNewsWindow, selectWeeklyNews, NEWS_WINDOW_FALLBACK_DAYS, NEWS_WINDOW_MAX_ITEMS } = load("lib/reports/news-window.ts");

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

const WEEK1_CUTOFF = "2026-08-28T18:00:00.000Z"; // report generated the Thursday-ish after storage week ending 2026-08-28
const WEEK2_CUTOFF = "2026-09-04T18:15:00.000Z";

test("computeNewsWindow: first report (no previous cutoff) falls back to NEWS_WINDOW_FALLBACK_DAYS before the current cutoff, deterministically", () => {
  const window = computeNewsWindow(null, WEEK1_CUTOFF);
  assert.equal(window.end, WEEK1_CUTOFF);
  const spanDays = (new Date(window.end).getTime() - new Date(window.start).getTime()) / 86_400_000;
  assert.ok(Math.abs(spanDays - NEWS_WINDOW_FALLBACK_DAYS) < 1e-9);
});

test("computeNewsWindow: with a previous cutoff, the window is exactly (previousDataCutoffAt, currentDataCutoffAt] -- contiguous, not storage-week-anchored", () => {
  const window = computeNewsWindow(WEEK1_CUTOFF, WEEK2_CUTOFF);
  assert.equal(window.start, WEEK1_CUTOFF);
  assert.equal(window.end, WEEK2_CUTOFF);
});

test("computeNewsWindow: consecutive reports produce contiguous, non-overlapping windows -- window 2's start equals window 1's end", () => {
  const window1 = computeNewsWindow(null, WEEK1_CUTOFF);
  const window2 = computeNewsWindow(WEEK1_CUTOFF, WEEK2_CUTOFF);
  assert.equal(window1.end, window2.start);
});

test("selectWeeklyNews: an article published AFTER the storage week's own Friday but before the report's data cutoff is included -- the core Issue 1 fix", () => {
  // Storage week ends Friday 2026-08-28; EIA typically releases the following Thursday (2026-09-03);
  // report cutoff is that evening. An article published the following Monday (2026-08-31, after the
  // storage-week Friday) must be included -- it would have been silently dropped by the old
  // storage-week-anchored window ([2026-08-22, 2026-08-28]).
  const window = computeNewsWindow(null, "2026-09-03T20:00:00.000Z");
  const postFridayArticle = article({ id: "post-friday", publishedAt: "2026-08-31T12:00:00.000Z" });
  const selected = selectWeeklyNews([postFridayArticle], window);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, "post-friday");
});

test("selectWeeklyNews: an article published exactly AT the previous cutoff is excluded (start is exclusive) -- no double-count across reports", () => {
  const window = computeNewsWindow(WEEK1_CUTOFF, WEEK2_CUTOFF);
  const atBoundary = article({ id: "at-start-boundary", publishedAt: WEEK1_CUTOFF });
  assert.deepEqual(selectWeeklyNews([atBoundary], window), []);
});

test("selectWeeklyNews: an article published exactly AT the current cutoff is included (end is inclusive)", () => {
  const window = computeNewsWindow(WEEK1_CUTOFF, WEEK2_CUTOFF);
  const atBoundary = article({ id: "at-end-boundary", publishedAt: WEEK2_CUTOFF });
  const selected = selectWeeklyNews([atBoundary], window);
  assert.equal(selected.length, 1);
});

test("selectWeeklyNews: a single article at an exact cutoff timestamp is never selected by both a report ending there and the next report starting there -- the two windows partition it without overlap", () => {
  const window1 = computeNewsWindow(null, WEEK1_CUTOFF);
  const window2 = computeNewsWindow(WEEK1_CUTOFF, WEEK2_CUTOFF);
  const atSharedBoundary = article({ id: "shared-boundary", publishedAt: WEEK1_CUTOFF });
  const inWindow1 = selectWeeklyNews([atSharedBoundary], window1).length;
  const inWindow2 = selectWeeklyNews([atSharedBoundary], window2).length;
  assert.equal(inWindow1 + inWindow2, 1, "must appear in exactly one of the two consecutive reports, never both and never neither");
});

test("selectWeeklyNews: excludes an article published before the window", () => {
  const window = computeNewsWindow(null, WEEK1_CUTOFF);
  const outside = article({ id: "outside", publishedAt: "2026-08-01T00:00:00.000Z" });
  assert.deepEqual(selectWeeklyNews([outside], window), []);
});

test("selectWeeklyNews: excludes an article published after the window (future relative to the report's own cutoff)", () => {
  const window = computeNewsWindow(null, WEEK1_CUTOFF);
  const future = article({ id: "future", publishedAt: "2026-09-10T00:00:00.000Z" });
  assert.deepEqual(selectWeeklyNews([future], window), []);
});

test("selectWeeklyNews: excludes an article that is not status 'analyzed', even if it falls inside the window -- never fabricates its analysis, never re-runs News AI", () => {
  const window = computeNewsWindow(null, WEEK1_CUTOFF);
  const pending = article({ id: "pending", processingStatus: "retained", publishedAt: "2026-08-25T00:00:00.000Z" });
  assert.deepEqual(selectWeeklyNews([pending], window), []);
});

test("selectWeeklyNews: includes an eligible in-window analyzed article", () => {
  const window = computeNewsWindow(null, WEEK1_CUTOFF);
  const eligible = article({ id: "eligible", publishedAt: "2026-08-25T00:00:00.000Z" });
  const selected = selectWeeklyNews([eligible], window);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, "eligible");
});

test("selectWeeklyNews: ranks 'high' impact strength before 'medium' before 'low'", () => {
  const window = computeNewsWindow(null, WEEK1_CUTOFF);
  const low = article({ id: "low", impactStrength: "low", publishedAt: "2026-08-25T00:00:00.000Z" });
  const high = article({ id: "high", impactStrength: "high", publishedAt: "2026-08-25T00:00:00.000Z" });
  const medium = article({ id: "medium", impactStrength: "medium", publishedAt: "2026-08-25T00:00:00.000Z" });
  const selected = selectWeeklyNews([low, high, medium], window);
  assert.deepEqual(selected.map((a) => a.id), ["high", "medium", "low"]);
});

test("selectWeeklyNews: within the same impact strength, higher relevanceScore ranks first", () => {
  const window = computeNewsWindow(null, WEEK1_CUTOFF);
  const lowRelevance = article({ id: "low-rel", relevanceScore: 0.2, publishedAt: "2026-08-25T00:00:00.000Z" });
  const highRelevance = article({ id: "high-rel", relevanceScore: 0.9, publishedAt: "2026-08-25T00:00:00.000Z" });
  const selected = selectWeeklyNews([lowRelevance, highRelevance], window);
  assert.deepEqual(selected.map((a) => a.id), ["high-rel", "low-rel"]);
});

test("selectWeeklyNews: caps at NEWS_WINDOW_MAX_ITEMS even when more are eligible", () => {
  const window = computeNewsWindow(null, WEEK1_CUTOFF);
  const many = Array.from({ length: NEWS_WINDOW_MAX_ITEMS + 5 }, (_, i) => article({ id: `a${i}`, publishedAt: "2026-08-25T00:00:00.000Z" }));
  const selected = selectWeeklyNews(many, window);
  assert.equal(selected.length, NEWS_WINDOW_MAX_ITEMS);
});

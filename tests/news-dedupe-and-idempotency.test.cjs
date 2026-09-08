const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { normalizeRawArticle } = load("lib/news/normalize/normalize.ts");
const { dedupeArticles, partitionAgainstExisting } = load("lib/news/dedupe.ts");

function raw(overrides) {
  return {
    sourceId: "test-source",
    sourceTier: "tier2_major_news",
    headline: "EQT raises full-year guidance",
    url: "https://example.com/eqt-guidance",
    publisher: "Example Wire",
    publishedAt: "2026-08-15T09:00:00.000Z",
    excerpt: null,
    ...overrides
  };
}

test("dedupeArticles collapses an article re-collected with an identical normalized URL", () => {
  const retrievedAt = "2026-08-15T10:00:00.000Z";
  const a = normalizeRawArticle(raw({ url: "https://example.com/eqt-guidance?utm_source=rss" }), retrievedAt);
  const b = normalizeRawArticle(raw({ url: "https://example.com/eqt-guidance?utm_source=newsletter" }), retrievedAt);

  const result = dedupeArticles([a, b]);
  assert.equal(result.kept.length, 1);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].reason, "normalized_url");
});

test("dedupeArticles collapses syndicated copies via fingerprint (same headline/day, different URL and publisher)", () => {
  const retrievedAt = "2026-08-15T10:00:00.000Z";
  const reuters = normalizeRawArticle(
    raw({ url: "https://reuters.example.com/eqt-guidance", publisher: "Reuters", publishedAt: "2026-08-15T09:00:00.000Z" }),
    retrievedAt
  );
  const yahoo = normalizeRawArticle(
    raw({
      url: "https://finance.yahoo.example.com/news/eqt-guidance",
      publisher: "Yahoo Finance",
      publishedAt: "2026-08-15T09:15:00.000Z",
      headline: "EQT raises full-year guidance - Reuters"
    }),
    retrievedAt
  );

  const result = dedupeArticles([reuters, yahoo]);
  assert.equal(result.kept.length, 1);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].reason, "fingerprint");
});

test("dedupeArticles keeps genuinely distinct stories", () => {
  const retrievedAt = "2026-08-15T10:00:00.000Z";
  const a = normalizeRawArticle(raw({ headline: "EQT raises full-year guidance", url: "https://example.com/a" }), retrievedAt);
  const b = normalizeRawArticle(raw({ headline: "Range Resources reports Marcellus production", url: "https://example.com/b" }), retrievedAt);

  const result = dedupeArticles([a, b]);
  assert.equal(result.kept.length, 2);
  assert.equal(result.duplicates.length, 0);
});

test("partitionAgainstExisting filters out articles already in storage by URL or fingerprint -- this is what makes a repeat pipeline run idempotent", () => {
  const retrievedAt = "2026-08-15T10:00:00.000Z";
  const alreadyStored = normalizeRawArticle(raw({ url: "https://example.com/already-stored" }), retrievedAt);
  const brandNew = normalizeRawArticle(raw({ headline: "Brand new story", url: "https://example.com/brand-new" }), retrievedAt);

  const existingUrls = new Set([alreadyStored.normalizedUrl]);
  const existingFingerprints = new Set([alreadyStored.fingerprint]);

  const result = partitionAgainstExisting([alreadyStored, brandNew], existingFingerprints, existingUrls);
  assert.deepEqual(
    result.kept.map((a) => a.headline),
    ["Brand new story"]
  );
  assert.equal(result.duplicates.length, 1);
});

test("running the same collection through partitionAgainstExisting twice discovers zero new articles the second time", () => {
  const retrievedAt = "2026-08-15T10:00:00.000Z";
  const article = normalizeRawArticle(raw({}), retrievedAt);

  const firstRunExistingUrls = new Set();
  const firstRunExistingFingerprints = new Set();
  const firstRun = partitionAgainstExisting([article], firstRunExistingFingerprints, firstRunExistingUrls);
  assert.equal(firstRun.kept.length, 1);

  const secondRunExistingUrls = new Set([article.normalizedUrl]);
  const secondRunExistingFingerprints = new Set([article.fingerprint]);
  const secondRun = partitionAgainstExisting([article], secondRunExistingFingerprints, secondRunExistingUrls);
  assert.equal(secondRun.kept.length, 0, "re-ingesting the identical article must discover nothing new");
});

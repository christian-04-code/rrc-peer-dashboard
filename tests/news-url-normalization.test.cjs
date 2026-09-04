const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { normalizeArticleUrl, canonicalizeDisplayUrl } = load("lib/news/normalize/url.ts");

test("strips known tracking parameters", () => {
  const normalized = normalizeArticleUrl("https://example.com/story?utm_source=twitter&utm_medium=social&id=42");
  assert.equal(normalized, "https://example.com/story?id=42");
});

test("strips fbclid, gclid, and other click-id params", () => {
  const normalized = normalizeArticleUrl("https://example.com/story?fbclid=abc&gclid=xyz&mc_cid=1&mc_eid=2");
  assert.equal(normalized, "https://example.com/story");
});

test("sorts remaining query params for order-independent comparison", () => {
  const a = normalizeArticleUrl("https://example.com/story?b=2&a=1");
  const b = normalizeArticleUrl("https://example.com/story?a=1&b=2");
  assert.equal(a, b);
});

test("lowercases the hostname but not the path", () => {
  const normalized = normalizeArticleUrl("https://EXAMPLE.com/Story-Title");
  assert.equal(normalized, "https://example.com/Story-Title");
});

test("strips a trailing slash and the URL fragment", () => {
  const normalized = normalizeArticleUrl("https://example.com/story/#section-2");
  assert.equal(normalized, "https://example.com/story");
});

test("two syndicated URLs with different tracking params but the same story normalize identically", () => {
  const reuters = normalizeArticleUrl("https://example.com/business/energy/story-123?utm_source=rss");
  const yahooSyndication = normalizeArticleUrl("https://example.com/business/energy/story-123/?utm_medium=referral&utm_campaign=yahoo");
  assert.equal(reuters, yahooSyndication);
});

test("canonicalizeDisplayUrl strips tracking params but preserves path casing and param order for display", () => {
  // WHATWG URL parsing always lowercases the hostname (hostnames are
  // case-insensitive per spec); only the path/query casing is worth
  // asserting is preserved here.
  const display = canonicalizeDisplayUrl("https://example.com/Story?utm_source=x&id=7");
  assert.equal(display, "https://example.com/Story?id=7");
});

test("distinct stories with distinct paths normalize to distinct URLs", () => {
  const a = normalizeArticleUrl("https://example.com/story-a");
  const b = normalizeArticleUrl("https://example.com/story-b");
  assert.notEqual(a, b);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { normalizeHeadline } = load("lib/news/normalize/headline.ts");
const { computeArticleFingerprint } = load("lib/news/fingerprint.ts");

test("normalizeHeadline lowercases and strips punctuation", () => {
  assert.equal(normalizeHeadline("Range Resources Reports Q2 Results!"), "range resources reports q2 results");
});

test("normalizeHeadline collapses whitespace and normalizes curly quotes", () => {
  assert.equal(normalizeHeadline("Range's   ‘strong’ quarter"), "range s strong quarter");
});

test("normalizeHeadline strips a trailing wire-service attribution", () => {
  assert.equal(normalizeHeadline("EQT raises guidance - Reuters"), "eqt raises guidance");
  assert.equal(normalizeHeadline("EQT raises guidance | Bloomberg"), "eqt raises guidance");
});

test("computeArticleFingerprint is stable for identical headline + publication day", () => {
  const a = computeArticleFingerprint("Range Resources Reports Q2 Results", "2026-08-15T09:00:00.000Z");
  const b = computeArticleFingerprint("Range Resources Reports Q2 Results", "2026-08-15T21:30:00.000Z");
  assert.equal(a, b, "same headline + same publication day should fingerprint identically regardless of time-of-day");
});

test("computeArticleFingerprint differs across publication days", () => {
  const day1 = computeArticleFingerprint("Range Resources Reports Q2 Results", "2026-08-15T09:00:00.000Z");
  const day2 = computeArticleFingerprint("Range Resources Reports Q2 Results", "2026-08-16T09:00:00.000Z");
  assert.notEqual(day1, day2);
});

test("computeArticleFingerprint differs for different headlines", () => {
  const a = computeArticleFingerprint("Range Resources Reports Q2 Results", "2026-08-15T09:00:00.000Z");
  const b = computeArticleFingerprint("EQT Reports Q2 Results", "2026-08-15T09:00:00.000Z");
  assert.notEqual(a, b);
});

test("syndicated copies with cosmetically different headlines (wire attribution, quotes) fingerprint identically", () => {
  const reuters = computeArticleFingerprint("EQT raises full-year guidance - Reuters", "2026-08-15T09:00:00.000Z");
  const yahoo = computeArticleFingerprint("EQT raises full-year guidance", "2026-08-15T14:00:00.000Z");
  assert.equal(reuters, yahoo);
});

test("a null publication date still produces a stable, distinguishable fingerprint", () => {
  const a = computeArticleFingerprint("Some headline with no date", null);
  const b = computeArticleFingerprint("Some headline with no date", null);
  const c = computeArticleFingerprint("A different headline with no date", null);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

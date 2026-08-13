const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RRC_FACTS = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/sec-pipeline/rrc-companyfacts-trimmed.json"), "utf8"));

async function loadXbrl() {
  return import("../lib/sec-pipeline/xbrl.mjs");
}

test("extractFinancialField reproduces RRC's real, known-good Q2 2026 revenue via exact-period XBRL match", async () => {
  const xbrl = await loadXbrl();
  const field = xbrl.extractFinancialField(RRC_FACTS, "revenue", { periodStart: "2026-04-01", periodEnd: "2026-06-30", accessionNumber: "0001193125-26-310446", filingUrl: "https://example.com" });
  assert.equal(field.value, 833.571);
  assert.equal(field.classification, "A");
  assert.equal(field.confidence, "high");
  assert.equal(field.source, "sec-xbrl");
});

test("extractFinancialField reproduces RRC's real Q2 2026 diluted shares", async () => {
  const xbrl = await loadXbrl();
  const field = xbrl.extractFinancialField(RRC_FACTS, "dilutedShares", { periodStart: "2026-04-01", periodEnd: "2026-06-30", accessionNumber: "x", filingUrl: "x", unit: "MM" });
  assert.equal(field.value, 236.21);
  assert.equal(field.unit, "MM");
});

test("comparative-column protection: refuses when no fact has the exact requested start/end (wrong comparative year)", async () => {
  const xbrl = await loadXbrl();
  // 2025-04-01/2025-06-30 is a different (comparative) period than any period this trimmed fixture retains for exact match at Q2 2026's own dates.
  const result = xbrl.findExactPeriodFact(RRC_FACTS, "Revenues", { periodStart: "2020-04-01", periodEnd: "2020-06-30" });
  assert.equal(result.fact, null);
  assert.match(result.reason, /No Revenues fact with exact start\/end/);
});

test("YTD-vs-quarter protection: refuses a window that isn't ~1 quarter long", async () => {
  const xbrl = await loadXbrl();
  const result = xbrl.findExactPeriodFact(RRC_FACTS, "Revenues", { periodStart: "2026-01-01", periodEnd: "2026-06-30" }, );
  assert.equal(result.fact, null);
  assert.match(result.reason, /not a standalone quarter/);
});

test("findExactPeriodFact accepts a real YTD (six-month) window only when expectQuarterDuration is explicitly disabled", async () => {
  const xbrl = await loadXbrl();
  // RRC's 10-Q also reports a genuine six-month-YTD fact (2026-01-01..2026-06-30); by default this is refused as "not a standalone quarter".
  const refused = xbrl.findExactPeriodFact(RRC_FACTS, "Revenues", { periodStart: "2026-01-01", periodEnd: "2026-06-30" });
  assert.equal(refused.fact, null);
  assert.match(refused.reason, /not a standalone quarter/);

  const explicit = xbrl.findExactPeriodFact(RRC_FACTS, "Revenues", { periodStart: "2026-01-01", periodEnd: "2026-06-30", expectQuarterDuration: false });
  assert.equal(explicit.fact.val, 1867741000);
});

test("extractFinancialField returns a blank (classification D) field, never a guess, when no concept matches", async () => {
  const xbrl = await loadXbrl();
  const field = xbrl.extractFinancialField(RRC_FACTS, "cashFromOperations", { periodStart: "2026-04-01", periodEnd: "2026-06-30", accessionNumber: "x", filingUrl: "x" });
  assert.equal(field.value, null);
  assert.equal(field.classification, "D");
  assert.equal(field.source, "unavailable");
});

test("extractFinancialField throws for an unmapped field name rather than silently returning blank", async () => {
  const xbrl = await loadXbrl();
  assert.throws(() => xbrl.extractFinancialField(RRC_FACTS, "notARealField", { periodStart: "2026-04-01", periodEnd: "2026-06-30" }));
});

test("company-generic: the same extraction function reproduces AR's real Q2 2026 revenue via exact-period XBRL match", async () => {
  const xbrl = await loadXbrl();
  const arFacts = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/sec-pipeline/ar-companyfacts-trimmed.json"), "utf8"));
  const revenue = xbrl.extractFinancialField(arFacts, "revenue", { periodStart: "2026-04-01", periodEnd: "2026-06-30", accessionNumber: "x", filingUrl: "x" });
  assert.equal(revenue.value, 1559.842);
});

test("real-world finding: AR's raw XBRL diluted-share fact legitimately differs from the canonical human-transcribed EPS-note figure for the same filing", async () => {
  // This is exactly the class of definitional trap PHASE 3 warns about. The pipeline still
  // extracts the XBRL fact deterministically (classification A) -- it is update.mjs's job (see
  // sec-pipeline-cli.test.cjs) to compare it against the already-canonical value and require
  // review rather than silently overwrite, never this low-level extractor's job to reconcile them.
  const xbrl = await loadXbrl();
  const arFacts = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/sec-pipeline/ar-companyfacts-trimmed.json"), "utf8"));
  const shares = xbrl.extractFinancialField(arFacts, "dilutedShares", { periodStart: "2026-04-01", periodEnd: "2026-06-30", accessionNumber: "x", filingUrl: "x", unit: "MM" });
  assert.equal(shares.value, 310.643); // raw XBRL WeightedAverageNumberOfDilutedSharesOutstanding
  assert.notEqual(shares.value, 313.184); // data/historical.json's canonical "Diluted Weighted-Average Shares (MM)" for AR Q2 2026
});

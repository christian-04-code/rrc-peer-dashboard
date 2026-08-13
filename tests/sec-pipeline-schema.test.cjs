const { test } = require("node:test");
const assert = require("node:assert/strict");

async function loadSchema() {
  return import("../lib/sec-pipeline/candidate-schema.mjs");
}

test("createCandidateSkeleton populates every group with blank (classification D) fields", async () => {
  const schema = await loadSchema();
  const candidate = schema.createCandidateSkeleton({
    ticker: "RRC",
    fiscalYear: 2026,
    fiscalQuarter: 3,
    filingType: "10-Q",
    filingDate: "2026-10-20",
    accessionNumber: "0001193125-26-123456",
    sourcePath: "data/sec/RRC/2026-09-30/x/filing.htm",
  });
  assert.equal(candidate.identity.quarterKey, "Q3 2026");
  for (const group of ["financial", "production", "pricing", "costs", "operating"]) {
    for (const field of Object.values(candidate[group])) {
      assert.equal(field.value, null);
      assert.equal(field.classification, "D");
    }
  }
});

test("createCandidateSkeleton rejects an invalid identity", async () => {
  const schema = await loadSchema();
  assert.throws(() => schema.createCandidateSkeleton({ ticker: "rrc", fiscalYear: 2026, fiscalQuarter: 3, filingType: "10-Q", filingDate: "2026-10-20", accessionNumber: "bad", sourcePath: "x" }));
});

test("makeCandidateField rejects NaN and stringified sentinels", async () => {
  const schema = await loadSchema();
  assert.throws(() => schema.makeCandidateField({ value: NaN, source: "sec-xbrl", extractionStatus: "extracted", classification: "A" }));
  assert.throws(() => schema.makeCandidateField({ value: "#N/A", source: "sec-xbrl", extractionStatus: "extracted", classification: "A" }));
});

test("makeGuidanceCandidate allows a point-estimate entry (null low/high)", async () => {
  const schema = await loadSchema();
  const entry = schema.makeGuidanceCandidate({
    metric: "leverage_target", low: null, midpoint: 1, high: null, unit: "x", period: "Mid-Cycle",
    status: "current", reportingCycle: "Q3 2026", source: "Earnings Call", directVsDerived: "direct", chartable: true,
  });
  assert.equal(entry.midpoint, 1);
});

test("makeGuidanceCandidate rejects low > high and out-of-range midpoint", async () => {
  const schema = await loadSchema();
  assert.throws(() => schema.makeGuidanceCandidate({
    metric: "capex", low: 100, high: 50, unit: "$MM", period: "FY 2026", status: "current",
    reportingCycle: "Q3 2026", source: "x", directVsDerived: "direct", chartable: true,
  }));
  assert.throws(() => schema.makeGuidanceCandidate({
    metric: "capex", low: 100, midpoint: 900, high: 200, unit: "$MM", period: "FY 2026", status: "current",
    reportingCycle: "Q3 2026", source: "x", directVsDerived: "direct", chartable: true,
  }));
});

test("makeGuidanceCandidate requires at least one of low/midpoint/high", async () => {
  const schema = await loadSchema();
  assert.throws(() => schema.makeGuidanceCandidate({
    metric: "capex", unit: "$MM", period: "FY 2026", status: "current",
    reportingCycle: "Q3 2026", source: "x", directVsDerived: "direct", chartable: true,
  }));
});

test("classify.mjs: AUTO_APPLY only for high-confidence A/B fields with no prior value", async () => {
  const schema = await loadSchema();
  const classify = await import("../lib/sec-pipeline/classify.mjs");
  const field = schema.makeCandidateField({ value: 100, unit: "$MM", source: "sec-xbrl", extractionStatus: "extracted", classification: "A", confidence: "high" });
  const result = classify.classifyField(field, undefined);
  assert.equal(result.action, "AUTO_APPLY");
});

test("classify.mjs: classification C is always REVIEW_REQUIRED even with a value", async () => {
  const schema = await loadSchema();
  const classify = await import("../lib/sec-pipeline/classify.mjs");
  const field = schema.makeCandidateField({ value: 100, unit: "$MM", source: "sec-text", extractionStatus: "manual-input", classification: "C", confidence: "medium" });
  const result = classify.classifyField(field, undefined);
  assert.equal(result.action, "REVIEW_REQUIRED");
});

test("classify.mjs: LEAVE_BLANK for classification D or null value", async () => {
  const schema = await loadSchema();
  const classify = await import("../lib/sec-pipeline/classify.mjs");
  assert.equal(classify.classifyField(schema.makeBlankField(), undefined).action, "LEAVE_BLANK");
});

test("classify.mjs: UNCHANGED when proposed value matches current canonical value", async () => {
  const schema = await loadSchema();
  const classify = await import("../lib/sec-pipeline/classify.mjs");
  const field = schema.makeCandidateField({ value: 833.571, unit: "$MM", source: "sec-xbrl", extractionStatus: "extracted", classification: "A", confidence: "high" });
  const result = classify.classifyField(field, 833.571);
  assert.equal(result.action, "UNCHANGED");
});

test("classify.mjs: any disagreement with an already-canonical value for the same quarter is REVIEW_REQUIRED, never silently auto-applied -- even for a high-confidence A field", async () => {
  const schema = await loadSchema();
  const classify = await import("../lib/sec-pipeline/classify.mjs");
  const field = schema.makeCandidateField({ value: 900, unit: "$MM", source: "sec-xbrl", extractionStatus: "extracted", classification: "A", confidence: "high" });
  const result = classify.classifyField(field, 100);
  assert.equal(result.action, "REVIEW_REQUIRED");
  assert.match(result.notes, /never auto-applied over an existing recorded figure/);
});

test("classify.mjs: sub-threshold confidence downgrades A/B to REVIEW_REQUIRED, never silently auto-applies", async () => {
  const schema = await loadSchema();
  const classify = await import("../lib/sec-pipeline/classify.mjs");
  const field = schema.makeCandidateField({ value: 100, unit: "$MM", source: "sec-xbrl", extractionStatus: "extracted", classification: "A", confidence: "medium" });
  const result = classify.classifyField(field, undefined);
  assert.equal(result.action, "REVIEW_REQUIRED");
});

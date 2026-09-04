const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { classifyInformationLevel, rankEvidenceByMateriality, MATERIAL_COMPARISON_MAGNITUDE_PCT } = load("lib/reports/materiality.ts");

function inputs(overrides = {}) {
  return {
    isNewThisWeek: false,
    changedSincePreviousReport: false,
    riskSeverityRank: null,
    riskState: null,
    rangeImpactDirection: null,
    rangeImpactStrength: null,
    comparisonMagnitudePct: null,
    ...overrides
  };
}

function item(evidenceId, materialityInputs, comparisons = []) {
  return { evidenceId, category: "storage", metricKey: "x", label: evidenceId, currentValue: null, displayValue: "", unit: null, period: null, asOfDate: null, sourceIds: [], freshness: "current", comparisons, rangeDrivers: [], materialityInputs, metadata: {} };
}

test("classifyInformationLevel: routine when nothing is new, changed, risky, high-impact, or large-magnitude", () => {
  assert.equal(classifyInformationLevel(inputs()), "routine");
});

test("classifyInformationLevel: new this week is always high", () => {
  assert.equal(classifyInformationLevel(inputs({ isNewThisWeek: true })), "high");
});

test("classifyInformationLevel: changed since previous report is always high", () => {
  assert.equal(classifyInformationLevel(inputs({ changedSincePreviousReport: true })), "high");
});

test("classifyInformationLevel: HIGH_RISK/MODERATE_RISK are high; WATCH/SUPPORTIVE are not by themselves", () => {
  assert.equal(classifyInformationLevel(inputs({ riskState: "HIGH_RISK" })), "high");
  assert.equal(classifyInformationLevel(inputs({ riskState: "MODERATE_RISK" })), "high");
  assert.equal(classifyInformationLevel(inputs({ riskState: "WATCH" })), "routine");
  assert.equal(classifyInformationLevel(inputs({ riskState: "SUPPORTIVE" })), "routine");
});

test("classifyInformationLevel: a 'high' News impact strength is high on its own", () => {
  assert.equal(classifyInformationLevel(inputs({ rangeImpactStrength: "high" })), "high");
  assert.equal(classifyInformationLevel(inputs({ rangeImpactStrength: "medium" })), "routine");
});

test(`classifyInformationLevel: a comparison magnitude at or above ${MATERIAL_COMPARISON_MAGNITUDE_PCT}% is high regardless of sign`, () => {
  assert.equal(classifyInformationLevel(inputs({ comparisonMagnitudePct: MATERIAL_COMPARISON_MAGNITUDE_PCT })), "high");
  assert.equal(classifyInformationLevel(inputs({ comparisonMagnitudePct: -MATERIAL_COMPARISON_MAGNITUDE_PCT - 1 })), "high");
  assert.equal(classifyInformationLevel(inputs({ comparisonMagnitudePct: MATERIAL_COMPARISON_MAGNITUDE_PCT - 0.01 })), "routine");
});

test("rankEvidenceByMateriality: new/changed items sort before unchanged ones", () => {
  const items = [item("a", inputs()), item("b", inputs({ isNewThisWeek: true }))];
  const ranked = rankEvidenceByMateriality(items);
  assert.equal(ranked[0].evidenceId, "b");
});

test("rankEvidenceByMateriality: among risk items, HIGH_RISK ranks before MODERATE_RISK before WATCH", () => {
  const items = [item("watch", inputs({ riskState: "WATCH" })), item("high", inputs({ riskState: "HIGH_RISK" })), item("moderate", inputs({ riskState: "MODERATE_RISK" }))];
  const ranked = rankEvidenceByMateriality(items);
  assert.deepEqual(ranked.map((i) => i.evidenceId), ["high", "moderate", "watch"]);
});

test("rankEvidenceByMateriality: falls back to comparison magnitude, largest first, when risk state is tied/absent", () => {
  const items = [item("small", inputs({ comparisonMagnitudePct: 2 })), item("large", inputs({ comparisonMagnitudePct: 20 }))];
  const ranked = rankEvidenceByMateriality(items);
  assert.deepEqual(ranked.map((i) => i.evidenceId), ["large", "small"]);
});

test("rankEvidenceByMateriality: fully deterministic tie-break by evidenceId when every other signal is equal", () => {
  const items = [item("zzz", inputs()), item("aaa", inputs())];
  const ranked = rankEvidenceByMateriality(items);
  assert.deepEqual(ranked.map((i) => i.evidenceId), ["aaa", "zzz"]);
});

test("rankEvidenceByMateriality: does not mutate the input array", () => {
  const items = [item("b", inputs()), item("a", inputs({ isNewThisWeek: true }))];
  const copy = [...items];
  rankEvidenceByMateriality(items);
  assert.deepEqual(items, copy);
});

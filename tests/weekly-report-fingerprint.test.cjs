const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { computeWeeklyReportFingerprint } = load("lib/reports/fingerprint.ts");

function evidenceItem(overrides) {
  return {
    evidenceId: "storage:lower48",
    category: "storage",
    metricKey: "lower48_storage",
    label: "Lower 48 Storage",
    currentValue: 3000,
    displayValue: "3000 Bcf",
    unit: "Bcf",
    period: "2026-08-28",
    asOfDate: "2026-08-28",
    sourceIds: ["macro_storage"],
    freshness: "current",
    comparisons: [{ period: "WoW", metricKey: "lower48_storage", label: "Lower 48 Storage", currentValue: 3000, previousValue: 2900, delta: 100, deltaPct: 3.4, direction: "up", basisDescription: "vs. week ending 2026-08-21" }],
    rangeDrivers: ["storage_levels"],
    materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 3.4 },
    metadata: { fetchedAt: "irrelevant" },
    ...overrides
  };
}

function payload(modules, overrides = {}) {
  return { schemaVersion: "1.0.0", storageWeekEnding: "2026-08-28", modules, ...overrides };
}

test("computeWeeklyReportFingerprint: identical inputs produce identical fingerprints", () => {
  const a = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem()] }));
  const b = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem()] }));
  assert.equal(a, b);
});

test("computeWeeklyReportFingerprint: a real value change produces a different fingerprint", () => {
  const a = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem()] }));
  const b = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem({ currentValue: 3100, displayValue: "3100 Bcf" })] }));
  assert.notEqual(a, b);
});

test("computeWeeklyReportFingerprint: an added evidence item changes the fingerprint", () => {
  const a = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem()] }));
  const b = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem(), evidenceItem({ evidenceId: "storage:lower48_2" })] }));
  assert.notEqual(a, b);
});

test("computeWeeklyReportFingerprint: insensitive to object key insertion order within an evidence item", () => {
  const item = evidenceItem();
  const reordered = Object.fromEntries(Object.entries(item).reverse());
  const a = computeWeeklyReportFingerprint(payload({ storage: [item] }));
  const b = computeWeeklyReportFingerprint(payload({ storage: [reordered] }));
  assert.equal(a, b);
});

test("computeWeeklyReportFingerprint: insensitive to array order across categories and across items within a category", () => {
  const a = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem()], gas_pricing: [evidenceItem({ evidenceId: "gas_pricing:henry_hub_spot", category: "gas_pricing" })] }));
  const b = computeWeeklyReportFingerprint(payload({ gas_pricing: [evidenceItem({ evidenceId: "gas_pricing:henry_hub_spot", category: "gas_pricing" })], storage: [evidenceItem()] }));
  assert.equal(a, b);
});

test("computeWeeklyReportFingerprint: insensitive to volatile metadata contents (e.g. a fetch timestamp) that don't represent a real data change", () => {
  const a = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem({ metadata: { fetchedAt: "2026-08-28T10:00:00.000Z" } })] }));
  const b = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem({ metadata: { fetchedAt: "2026-08-28T23:59:59.999Z", extraVolatileField: Math.random() } })] }));
  assert.equal(a, b);
});

test("computeWeeklyReportFingerprint: insensitive to asOfDate/sourceIds/materialityInputs -- change-detection-derived, not real-world-data fields", () => {
  const a = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem()] }));
  const b = computeWeeklyReportFingerprint(
    payload({ storage: [evidenceItem({ asOfDate: "2026-08-29", sourceIds: ["different_source"], materialityInputs: { ...evidenceItem().materialityInputs, isNewThisWeek: true, changedSincePreviousReport: true } })] })
  );
  assert.equal(a, b);
});

test("computeWeeklyReportFingerprint: sensitive to a comparison's direction changing even if currentValue/previousValue stay in the fingerprinted view", () => {
  const a = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem()] }));
  const changedComparison = evidenceItem({ comparisons: [{ ...evidenceItem().comparisons[0], direction: "down" }] });
  const b = computeWeeklyReportFingerprint(payload({ storage: [changedComparison] }));
  assert.notEqual(a, b);
});

test("computeWeeklyReportFingerprint: sensitive to storageWeekEnding itself", () => {
  const a = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem()] }));
  const b = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem()] }, { storageWeekEnding: "2026-09-04" }));
  assert.notEqual(a, b);
});

test("computeWeeklyReportFingerprint: produces a real, well-formed SHA-256 hex digest", () => {
  const fingerprint = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem()] }));
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
});

// ---------------------------------------------------------------------------
// Phase 7B.1 -- displayValue is presentation-only and must not drive the
// fingerprint for numeric evidence (matches changes.ts's isEvidenceItemChanged
// semantic rule).
// ---------------------------------------------------------------------------

test("computeWeeklyReportFingerprint: a real currentValue change (3.326 -> 3.334) changes the fingerprint even when both round to the same displayValue '$3.33'", () => {
  const a = computeWeeklyReportFingerprint(payload({ gas_pricing: [evidenceItem({ evidenceId: "gas_pricing:henry_hub_spot", currentValue: 3.326, displayValue: "$3.33" })] }));
  const b = computeWeeklyReportFingerprint(payload({ gas_pricing: [evidenceItem({ evidenceId: "gas_pricing:henry_hub_spot", currentValue: 3.334, displayValue: "$3.33" })] }));
  assert.notEqual(a, b);
});

test("computeWeeklyReportFingerprint: a pure formatting/rounding change in displayValue, with currentValue unchanged, does NOT change the fingerprint", () => {
  const a = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem({ currentValue: 3000, displayValue: "3,000 Bcf" })] }));
  const b = computeWeeklyReportFingerprint(payload({ storage: [evidenceItem({ currentValue: 3000, displayValue: "3000.00 Bcf" })] }));
  assert.equal(a, b, "currentValue (the semantic fact) is unchanged; displayValue is presentation-only for numeric evidence");
});

test("computeWeeklyReportFingerprint: for genuinely qualitative evidence (currentValue null on both sides), a real displayValue text change DOES change the fingerprint -- it is the only available fact", () => {
  const qualitative = (text) => evidenceItem({ evidenceId: "range_company:guidance:RRC:capex:FY 2026", category: "range_company", currentValue: null, displayValue: text, comparisons: [] });
  const a = computeWeeklyReportFingerprint(payload({ range_company: [qualitative("Approximately flat vs. prior guidance")] }));
  const b = computeWeeklyReportFingerprint(payload({ range_company: [qualitative("Modestly higher than prior guidance")] }));
  assert.notEqual(a, b);
});

test("computeWeeklyReportFingerprint: for genuinely qualitative evidence, an unchanged displayValue text keeps the fingerprint stable", () => {
  const qualitative = evidenceItem({ evidenceId: "range_company:guidance:RRC:capex:FY 2026", category: "range_company", currentValue: null, displayValue: "Approximately flat vs. prior guidance", comparisons: [] });
  const a = computeWeeklyReportFingerprint(payload({ range_company: [{ ...qualitative }] }));
  const b = computeWeeklyReportFingerprint(payload({ range_company: [{ ...qualitative }] }));
  assert.equal(a, b);
});

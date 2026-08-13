const { test } = require("node:test");
const assert = require("node:assert/strict");

async function loadModules() {
  const [schema, derive] = await Promise.all([
    import("../lib/sec-pipeline/candidate-schema.mjs"),
    import("../lib/sec-pipeline/derive.mjs"),
  ]);
  return { schema, derive };
}

function highField(schema, value, unit = "$MM") {
  return schema.makeCandidateField({ value, unit, source: "sec-xbrl", extractionStatus: "extracted", classification: "A", confidence: "high" });
}

test("deriveNetDebt: total debt - cash, classification B, when both inputs are high-confidence", async () => {
  const { schema, derive } = await loadModules();
  const result = derive.deriveNetDebt(highField(schema, 834), highField(schema, 0.247));
  assert.equal(result.value, 833.753);
  assert.equal(result.classification, "B");
});

test("deriveNetDebt: blank when an input is classification C (ambiguous, e.g. carrying- vs face-value debt)", async () => {
  const { schema, derive } = await loadModules();
  const ambiguousDebt = schema.makeCandidateField({ value: 834, unit: "$MM", source: "sec-xbrl", extractionStatus: "extracted", classification: "C", confidence: "medium" });
  const result = derive.deriveNetDebt(ambiguousDebt, highField(schema, 0.247));
  assert.equal(result.value, null);
  assert.equal(result.classification, "D");
});

test("deriveCommodityMix: gas/NGL/oil percentages sum to 1 using the 6 Mcfe/bbl conversion", async () => {
  const { schema, derive } = await loadModules();
  const mix = derive.deriveCommodityMix({
    naturalGas: highField(schema, 1548.871, "MMcf/d"),
    ngl: highField(schema, 118.113, "Mbbl/d"),
    oilCondensate: highField(schema, 6.475, "Mbbl/d"),
  });
  const sum = mix.naturalGasPct.value + mix.nglPct.value + mix.oilCondensatePct.value;
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(Math.abs(mix.naturalGasPct.value - 0.674478172129495) < 1e-6); // matches RRC Q2 2026's real stored value
});

test("deriveTotalCashUnitCosts: sums per-unit cost components only when all are resolved (not REVIEW_REQUIRED)", async () => {
  const { schema, derive } = await loadModules();
  const components = {
    leaseOperatingExpense: highField(schema, 0.133, "$/Mcfe"),
    gatheringProcessingTransport: highField(schema, 1.516, "$/Mcfe"),
    cashGA: highField(schema, 0.2283, "$/Mcfe"),
    productionTaxes: schema.makeBlankField(),
  };
  const result = derive.deriveTotalCashUnitCosts(components);
  assert.ok(Math.abs(result.value - (0.133 + 1.516 + 0.2283)) < 1e-9);
});

test("deriveTotalCashUnitCosts: refuses (blank) when a disclosed component is still REVIEW_REQUIRED rather than silently omitting it", async () => {
  const { schema, derive } = await loadModules();
  const reviewRequired = schema.makeCandidateField({ value: 5, unit: "$/Mcfe", source: "sec-text", extractionStatus: "manual-input", classification: "C", confidence: "medium" });
  const components = {
    leaseOperatingExpense: highField(schema, 0.133, "$/Mcfe"),
    gatheringProcessingTransport: reviewRequired,
    cashGA: highField(schema, 0.2283, "$/Mcfe"),
    productionTaxes: schema.makeBlankField(),
  };
  const result = derive.deriveTotalCashUnitCosts(components);
  assert.equal(result.value, null);
});

test("deriveStandaloneQ4FromFullYear: exact FY minus Q1-Q3, refuses on unit mismatch", async () => {
  const { schema, derive } = await loadModules();
  const fy = highField(schema, 1000, "$MM");
  const q1 = highField(schema, 200, "$MM");
  const q2 = highField(schema, 250, "$MM");
  const q3 = highField(schema, 220, "$MM");
  const result = derive.deriveStandaloneQ4FromFullYear(fy, q1, q2, q3);
  assert.equal(result.value, 330);
  assert.equal(result.classification, "B");

  const q3WrongUnit = highField(schema, 220, "MMcfe/d");
  const blocked = derive.deriveStandaloneQ4FromFullYear(fy, q1, q2, q3WrongUnit);
  assert.equal(blocked.value, null);
});

test("deriveFreeCashFlow: cash from operations - capex", async () => {
  const { schema, derive } = await loadModules();
  const result = derive.deriveFreeCashFlow(highField(schema, 332.51), highField(schema, 222));
  assert.ok(Math.abs(result.value - 110.51) < 1e-9);
});

const { test } = require("node:test");
const assert = require("node:assert/strict");

async function loadModules() {
  const [schema, guardrails] = await Promise.all([
    import("../lib/sec-pipeline/candidate-schema.mjs"),
    import("../lib/sec-pipeline/guardrails.mjs"),
  ]);
  return { schema, guardrails };
}

function buildCandidate(schema, overrides = {}) {
  const identity = {
    ticker: "RRC", fiscalYear: 2026, fiscalQuarter: 3, filingType: "10-Q",
    filingDate: "2026-10-20", accessionNumber: "0001193125-26-999999",
    sourcePath: "data/sec/RRC/2026-09-30/x/filing.htm",
  };
  const candidate = schema.createCandidateSkeleton(identity);
  return { ...candidate, ...overrides };
}

function field(schema, value, unit, classification = "A") {
  return schema.makeCandidateField({ value, unit, source: "sec-xbrl", extractionStatus: "extracted", classification, confidence: "high", notes: "test fixture" });
}

test("validateUnitRanges: flags an implausible per-unit price (unit-scale error, e.g. 7.5 vs 7,500)", async () => {
  const { schema, guardrails } = await loadModules();
  const candidate = buildCandidate(schema);
  candidate.pricing.realizedGas = field(schema, 7500, "$/Mcf"); // should be ~2.79, not 7500 -- classic decimal/scale error
  const errors = guardrails.validateUnitRanges(candidate);
  assert.ok(errors.some((error) => error.code === "unit-sanity"));
});

test("validateUnitRanges: flags a stringified sentinel value (#N/A, NaN, undefined)", async () => {
  const { schema, guardrails } = await loadModules();
  const candidate = buildCandidate(schema);
  candidate.production.total = { ...candidate.production.total, value: "#N/A" };
  const errors = guardrails.validateUnitRanges(candidate);
  assert.ok(errors.some((error) => error.code === "sentinel-string"));
});

test("validateProductionReconciliation: passes when gas + 6x(NGL+oil) reconciles to total within tolerance", async () => {
  const { schema, guardrails } = await loadModules();
  const candidate = buildCandidate(schema);
  candidate.production.total = field(schema, 2296.399, "MMcfe/d");
  candidate.production.naturalGas = field(schema, 1548.871, "MMcf/d");
  candidate.production.ngl = field(schema, 118.113, "Mbbl/d");
  candidate.production.oilCondensate = field(schema, 6.475, "Mbbl/d");
  assert.deepEqual(guardrails.validateProductionReconciliation(candidate), []);
});

test("validateProductionReconciliation: flags when reported total diverges from components (e.g. completed wells vs TIL style component mixups)", async () => {
  const { schema, guardrails } = await loadModules();
  const candidate = buildCandidate(schema);
  candidate.production.total = field(schema, 5000, "MMcfe/d"); // way off from components
  candidate.production.naturalGas = field(schema, 1548.871, "MMcf/d");
  candidate.production.ngl = field(schema, 118.113, "Mbbl/d");
  candidate.production.oilCondensate = field(schema, 6.475, "Mbbl/d");
  const errors = guardrails.validateProductionReconciliation(candidate);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "production-reconciliation");
});

test("validateGuidanceOrdering: only enforced when low AND high are both present (point estimates with null low/high pass)", async () => {
  const { guardrails } = await loadModules();
  const entries = [
    { metric: "wells_til", low: null, midpoint: 4, high: null },
    { metric: "capex", low: 100, midpoint: 900, high: 200 }, // out of range -> error
    { metric: "revenue", low: 100, midpoint: 150, high: 200 }, // fine
  ];
  const errors = guardrails.validateGuidanceOrdering(entries);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /capex/);
});

test("validateShareCounts: rejects zero or negative diluted shares", async () => {
  const { schema, guardrails } = await loadModules();
  const candidate = buildCandidate(schema);
  candidate.financial.dilutedShares = field(schema, 0, "MM");
  const errors = guardrails.validateShareCounts(candidate);
  assert.equal(errors.length, 1);
});

test("validateProvenanceRequired: a non-null value without source/notes is rejected", async () => {
  const { schema, guardrails } = await loadModules();
  const candidate = buildCandidate(schema);
  candidate.financial.revenue = { value: 100, unit: "$MM", source: "unavailable", notes: null, provenance: null, classification: "A" };
  const errors = guardrails.validateProvenanceRequired(candidate);
  assert.ok(errors.some((error) => error.path === "financial.revenue"));
});

test("validateTickerQuarterUniqueness: refuses a duplicate quarter unless allowReplay is set", async () => {
  const { schema, guardrails } = await loadModules();
  const candidate = buildCandidate(schema);
  const blocked = guardrails.validateTickerQuarterUniqueness(candidate, ["Q3 2026"]);
  assert.equal(blocked.length, 1);
  const allowed = guardrails.validateTickerQuarterUniqueness(candidate, ["Q3 2026"], { allowReplay: true });
  assert.equal(allowed.length, 0);
});

test("validateCanonicalConsistency: flags disagreement between historical.json and financials-quarterly.ts beyond tolerance", async () => {
  const { guardrails } = await loadModules();
  assert.equal(guardrails.validateCanonicalConsistency(833.571, 833.571).length, 0);
  assert.equal(guardrails.validateCanonicalConsistency(833.571, 900).length, 1);
});

test("flagLargeQoQChanges: only flags classification-B AUTO_APPLY fields with a large swing vs. the PRIOR quarter; classification-A is exempt", async () => {
  const { guardrails } = await loadModules();
  const summary = [
    { group: "financial", field: "netDebt", action: "AUTO_APPLY", classification: "B", value: 900 },
    { group: "financial", field: "revenue", action: "AUTO_APPLY", classification: "A", value: 5000 }, // exempt: classification A
  ];
  const getPrior = (group, field) => (field === "netDebt" ? 100 : 100);
  const flags = guardrails.flagLargeQoQChanges(summary, getPrior, 0.3);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].field, "netDebt");
});

test("runAllGuardrails: large-but-valid, source-backed changes do not trigger a hard error (only REVIEW_REQUIRED elsewhere, never auto-fail)", async () => {
  const { schema, guardrails } = await loadModules();
  const candidate = buildCandidate(schema);
  candidate.financial.revenue = field(schema, 5000, "$MM"); // large but within unit sanity range, source-backed
  const result = guardrails.runAllGuardrails(candidate, { existingQuarterKeys: [] });
  assert.equal(result.valid, true);
});

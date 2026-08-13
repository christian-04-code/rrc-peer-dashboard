const { test } = require("node:test");
const assert = require("node:assert/strict");

async function loadModules() {
  const [schema, manualInput, marketBoundary, forecastSafety, report] = await Promise.all([
    import("../lib/sec-pipeline/candidate-schema.mjs"),
    import("../lib/sec-pipeline/manual-input.mjs"),
    import("../lib/sec-pipeline/market-boundary.mjs"),
    import("../lib/sec-pipeline/forecast-safety.mjs"),
    import("../lib/sec-pipeline/report.mjs"),
  ]);
  return { schema, manualInput, marketBoundary, forecastSafety, report };
}

function skeleton(schema) {
  return schema.createCandidateSkeleton({
    ticker: "RRC", fiscalYear: 2026, fiscalQuarter: 3, filingType: "10-Q",
    filingDate: "2026-10-20", accessionNumber: "0001193125-26-999999", sourcePath: "x",
  });
}

test("manual-input: every field it produces is classification C (REVIEW_REQUIRED-eligible), never auto-apply, even with a value", async () => {
  const { schema, manualInput } = await loadModules();
  const worksheet = { production: { total: { value: 2300, unit: "MMcfe/d", sourceLocation: "10-Q p.20" } } };
  const result = manualInput.applyManualWorksheet(skeleton(schema), worksheet);
  assert.equal(result.production.total.value, 2300);
  assert.equal(result.production.total.classification, "C");
});

test("manual-input: rejects an entry missing sourceLocation (provenance is mandatory, not optional)", async () => {
  const { schema, manualInput } = await loadModules();
  const worksheet = { production: { total: { value: 2300, unit: "MMcfe/d" } } };
  assert.throws(() => manualInput.applyManualWorksheet(skeleton(schema), worksheet));
});

test("manual-input: fields absent from the worksheet stay blank, not silently zero", async () => {
  const { schema, manualInput } = await loadModules();
  const result = manualInput.applyManualWorksheet(skeleton(schema), { production: { total: { value: 100, unit: "x", sourceLocation: "y" } } });
  assert.equal(result.production.naturalGas.value, null);
  assert.equal(result.production.naturalGas.classification, "D");
});

test("market-boundary: reports waiting-on-market-data (not fabricated) when no market cap is on file", async () => {
  const { marketBoundary } = await loadModules();
  const result = marketBoundary.evaluateMarketDataBoundary({ ticker: "RRC", quarterKey: "Q3 2026", hasMarketCapForQuarter: () => false, filingComplete: true });
  assert.equal(result.status, "waiting-on-market-data");
  assert.equal(result.valuationRefreshed, false);
});

test("market-boundary: reports complete only when BOTH filing and market data are present", async () => {
  const { marketBoundary } = await loadModules();
  const result = marketBoundary.evaluateMarketDataBoundary({ ticker: "RRC", quarterKey: "Q2 2026", hasMarketCapForQuarter: () => true, filingComplete: true });
  assert.equal(result.status, "complete");
  assert.equal(result.valuationRefreshed, true);
});

test("market-boundary: filing incompleteness takes precedence over market-data status", async () => {
  const { marketBoundary } = await loadModules();
  const result = marketBoundary.evaluateMarketDataBoundary({ ticker: "RRC", quarterKey: "Q3 2026", hasMarketCapForQuarter: () => true, filingComplete: false });
  assert.equal(result.status, "waiting-on-filing-data");
});

test("forecast-safety: checkDetailedActualEligibility is false while any detail field is REVIEW_REQUIRED or LEAVE_BLANK", async () => {
  const { schema, forecastSafety } = await loadModules();
  const candidate = skeleton(schema); // everything blank by default
  const result = forecastSafety.checkDetailedActualEligibility(candidate);
  assert.equal(result.eligible, false);
  assert.ok(result.missingFields.length > 0);
});

test("forecast-safety: compareForwardAssumptions flags REVIEW_REQUIRED on divergence but never mutates anything (pure function, RRC gas-differential precedent)", async () => {
  const { forecastSafety } = await loadModules();
  const deltas = forecastSafety.compareForwardAssumptions({ gasDifferential: -0.47 }, { gasDifferential: 0.35 }, 0.15);
  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].action, "REVIEW_REQUIRED");
  assert.match(deltas[0].reason, /forward assumptions are NOT auto-updated/);
});

test("forecast-safety: no divergence -> no flags", async () => {
  const { forecastSafety } = await loadModules();
  const deltas = forecastSafety.compareForwardAssumptions({ cashGA: 0.23 }, { cashGA: 0.22 }, 0.15);
  assert.equal(deltas.length, 0);
});

test("report: renders a table and correctly counts actions", async () => {
  const { schema, classify, report } = await loadModules().then(async (m) => ({ ...m, classify: await import("../lib/sec-pipeline/classify.mjs") }));
  const candidate = skeleton(schema);
  candidate.financial.revenue = schema.makeCandidateField({ value: 900, unit: "$MM", source: "sec-xbrl", extractionStatus: "extracted", classification: "A", confidence: "high", notes: "n" });
  const { summary } = classify.classifyCandidate(candidate, () => undefined);
  const full = report.buildFullReport(candidate, summary, { guardrailErrors: [] });
  assert.equal(full.actionCounts.AUTO_APPLY, 1);
  assert.ok(full.actionCounts.LEAVE_BLANK > 0);
  assert.match(full.table, /FIELD/);
  assert.equal(full.readyToApply, true);
});

test("report: guardrail errors mark the candidate not-ready-to-apply", async () => {
  const { schema, report } = await loadModules();
  const candidate = skeleton(schema);
  const full = report.buildFullReport(candidate, [], { guardrailErrors: [{ code: "x", path: "y", message: "z" }] });
  assert.equal(full.readyToApply, false);
});

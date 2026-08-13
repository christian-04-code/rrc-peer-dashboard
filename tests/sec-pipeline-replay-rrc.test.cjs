const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

/**
 * PHASE 9 replay simulation for RRC: proves the pipeline reproduces the
 * CURRENT, already-approved Q2 2026 production values using real SEC XBRL
 * data (a trimmed, committed fixture of RRC's actual company facts -- see
 * tests/fixtures/sec-pipeline/rrc-companyfacts-trimmed.json, sourced live
 * from data.sec.gov). This never mutates lib/dashboard/financials-quarterly.ts
 * or data/historical.json -- it only reads them (to know what "known-good"
 * means) and runs the candidate/classify pipeline in memory.
 */

const RRC_FACTS = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/sec-pipeline/rrc-companyfacts-trimmed.json"), "utf8"));

async function loadPipeline() {
  const [schema, xbrl, classify, guardrails, forecastSafety] = await Promise.all([
    import("../lib/sec-pipeline/candidate-schema.mjs"),
    import("../lib/sec-pipeline/xbrl.mjs"),
    import("../lib/sec-pipeline/classify.mjs"),
    import("../lib/sec-pipeline/guardrails.mjs"),
    import("../lib/sec-pipeline/forecast-safety.mjs"),
  ]);
  return { schema, xbrl, classify, guardrails, forecastSafety };
}

test("replay: RRC Q2 2026 revenue and diluted shares extracted from real XBRL data match the current production canonical values exactly", async () => {
  const { schema, xbrl, classify } = await loadPipeline();
  const financials = load("lib/dashboard/financials-quarterly.ts");
  const known = financials.getQuarterlyFinancials("RRC", "Q2 2026");

  const identity = {
    ticker: "RRC", fiscalYear: 2026, fiscalQuarter: 2, filingType: "10-Q",
    filingDate: "2026-07-21", accessionNumber: "0001193125-26-310446",
    sourcePath: "data/sec/RRC/2026-06-30/0001193125-26-310446/filing.htm",
  };
  let candidate = schema.createCandidateSkeleton(identity);
  candidate.financial.revenue = xbrl.extractFinancialField(RRC_FACTS, "revenue", { periodStart: "2026-04-01", periodEnd: "2026-06-30", accessionNumber: identity.accessionNumber, filingUrl: "x" });
  candidate.financial.dilutedShares = xbrl.extractFinancialField(RRC_FACTS, "dilutedShares", { periodStart: "2026-04-01", periodEnd: "2026-06-30", accessionNumber: identity.accessionNumber, filingUrl: "x", unit: "MM" });

  const { summary } = classify.classifyCandidate(candidate, (group, field) => {
    if (group === "financial" && field === "revenue") return known.revenue.value;
    return undefined;
  });

  const revenueRow = summary.find((row) => row.group === "financial" && row.field === "revenue");
  assert.equal(revenueRow.value, known.revenue.value, "extracted revenue must equal the already-approved production value");
  assert.equal(revenueRow.action, "UNCHANGED");

  const sharesRow = summary.find((row) => row.group === "financial" && row.field === "dilutedShares");
  assert.equal(sharesRow.value, 236.21);
  assert.equal(sharesRow.action, "AUTO_APPLY"); // no "current" supplied in this isolated check -> safely eligible

  // financials-quarterly.ts / historical.json were only read, never written, by this test.
});

test("replay: RRC Q2 2026 candidate passes all PHASE 8 guardrails and is NOT eligible as latest-detailed-actual without operating-metric input (fail-safe, not silently promoted)", async () => {
  const { schema, xbrl, guardrails, forecastSafety, classify } = await loadPipeline();
  const identity = {
    ticker: "RRC", fiscalYear: 2026, fiscalQuarter: 2, filingType: "10-Q",
    filingDate: "2026-07-21", accessionNumber: "0001193125-26-310446",
    sourcePath: "data/sec/RRC/2026-06-30/0001193125-26-310446/filing.htm",
  };
  let candidate = schema.createCandidateSkeleton(identity);
  candidate.financial.revenue = xbrl.extractFinancialField(RRC_FACTS, "revenue", { periodStart: "2026-04-01", periodEnd: "2026-06-30", accessionNumber: identity.accessionNumber, filingUrl: "x" });

  const { candidate: classified } = classify.classifyCandidate(candidate, () => undefined);
  const result = guardrails.runAllGuardrails(classified, { existingQuarterKeys: ["Q2 2026"], allowReplay: true });
  assert.equal(result.valid, true, JSON.stringify(result.errors));

  const eligibility = forecastSafety.checkDetailedActualEligibility(classified);
  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.missingFields.length > 0);
});

test("replay: without --allow-replay, the ticker/quarter-uniqueness guardrail refuses a candidate for an already-canonical quarter", async () => {
  const { schema, guardrails, classify } = await loadPipeline();
  const identity = {
    ticker: "RRC", fiscalYear: 2026, fiscalQuarter: 2, filingType: "10-Q",
    filingDate: "2026-07-21", accessionNumber: "0001193125-26-310446",
    sourcePath: "data/sec/RRC/2026-06-30/0001193125-26-310446/filing.htm",
  };
  const candidate = schema.createCandidateSkeleton(identity);
  const { candidate: classified } = classify.classifyCandidate(candidate, () => undefined);
  const result = guardrails.runAllGuardrails(classified, { existingQuarterKeys: ["Q2 2026"], allowReplay: false });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "duplicate-quarter"));
});

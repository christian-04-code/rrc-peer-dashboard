const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

/**
 * PHASE 9 replay simulation, second company (AR, not RRC): proves the
 * pipeline is company-generic, not hardcoded to RRC's filing shape. Uses a
 * trimmed, committed fixture of AR's real SEC XBRL company facts (see
 * tests/fixtures/sec-pipeline/ar-companyfacts-trimmed.json). Read-only against
 * the real canonical files, same as the RRC replay test.
 *
 * This replay also captures a genuine finding from running the pipeline
 * against real data: AR's raw XBRL WeightedAverageNumberOfDilutedSharesOutstanding
 * fact (310.643mm) legitimately disagrees with the already-canonical,
 * human-transcribed EPS-note figure (313.184mm) for the identical filing/period.
 * The correct, safe pipeline behavior is REVIEW_REQUIRED, not silently applying
 * the XBRL number over the settled one -- this test locks that behavior in.
 */

const AR_FACTS = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/sec-pipeline/ar-companyfacts-trimmed.json"), "utf8"));

async function loadPipeline() {
  const [schema, xbrl, classify, guardrails] = await Promise.all([
    import("../lib/sec-pipeline/candidate-schema.mjs"),
    import("../lib/sec-pipeline/xbrl.mjs"),
    import("../lib/sec-pipeline/classify.mjs"),
    import("../lib/sec-pipeline/guardrails.mjs"),
  ]);
  return { schema, xbrl, classify, guardrails };
}

test("replay: AR Q2 2026 revenue extracted from real XBRL data matches the current production canonical value exactly", async () => {
  const { schema, xbrl, classify } = await loadPipeline();
  const financials = load("lib/dashboard/financials-quarterly.ts");
  const known = financials.getQuarterlyFinancials("AR", "Q2 2026");

  const identity = {
    ticker: "AR", fiscalYear: 2026, fiscalQuarter: 2, filingType: "10-Q",
    filingDate: "2026-07-29", accessionNumber: "0001104659-26-088153",
    sourcePath: "data/sec/AR/2026-06-30/0001104659-26-088153/filing.htm",
  };
  const candidate = schema.createCandidateSkeleton(identity);
  candidate.financial.revenue = xbrl.extractFinancialField(AR_FACTS, "revenue", { periodStart: "2026-04-01", periodEnd: "2026-06-30", accessionNumber: identity.accessionNumber, filingUrl: "x" });

  const { summary } = classify.classifyCandidate(candidate, (group, field) => {
    if (group === "financial" && field === "revenue") return known.revenue.value;
    return undefined;
  });

  const revenueRow = summary.find((row) => row.group === "financial" && row.field === "revenue");
  assert.equal(revenueRow.value, known.revenue.value);
  assert.equal(revenueRow.action, "UNCHANGED");
});

test("replay: AR Q2 2026 diluted-share XBRL fact disagrees with the already-canonical historical.json value -> REVIEW_REQUIRED, never silently overwritten", async () => {
  const { schema, xbrl, classify } = await loadPipeline();
  const historicalFile = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "historical.json"), "utf8"));
  const canonicalDilutedShares = historicalFile.companies.AR.metrics["Diluted Weighted-Average Shares (MM)"].values["Q2 2026"];
  assert.equal(canonicalDilutedShares, 313.184); // sanity-check the fixture assumption still holds against production data

  const identity = {
    ticker: "AR", fiscalYear: 2026, fiscalQuarter: 2, filingType: "10-Q",
    filingDate: "2026-07-29", accessionNumber: "0001104659-26-088153",
    sourcePath: "data/sec/AR/2026-06-30/0001104659-26-088153/filing.htm",
  };
  const candidate = schema.createCandidateSkeleton(identity);
  candidate.financial.dilutedShares = xbrl.extractFinancialField(AR_FACTS, "dilutedShares", { periodStart: "2026-04-01", periodEnd: "2026-06-30", accessionNumber: identity.accessionNumber, filingUrl: "x", unit: "MM" });
  assert.equal(candidate.financial.dilutedShares.value, 310.643);

  const { summary } = classify.classifyCandidate(candidate, (group, field) => {
    if (group === "financial" && field === "dilutedShares") return canonicalDilutedShares;
    return undefined;
  });
  const sharesRow = summary.find((row) => row.group === "financial" && row.field === "dilutedShares");
  assert.equal(sharesRow.action, "REVIEW_REQUIRED");
  assert.match(sharesRow.notes, /never auto-applied over an existing recorded figure/);
});

test("replay: guardrails accept the AR candidate (company-generic, not RRC-specific validation)", async () => {
  const { schema, xbrl, classify, guardrails } = await loadPipeline();
  const identity = {
    ticker: "AR", fiscalYear: 2026, fiscalQuarter: 2, filingType: "10-Q",
    filingDate: "2026-07-29", accessionNumber: "0001104659-26-088153",
    sourcePath: "data/sec/AR/2026-06-30/0001104659-26-088153/filing.htm",
  };
  const candidate = schema.createCandidateSkeleton(identity);
  candidate.financial.revenue = xbrl.extractFinancialField(AR_FACTS, "revenue", { periodStart: "2026-04-01", periodEnd: "2026-06-30", accessionNumber: identity.accessionNumber, filingUrl: "x" });
  const { candidate: classified } = classify.classifyCandidate(candidate, () => undefined);
  const result = guardrails.runAllGuardrails(classified, { existingQuarterKeys: ["Q2 2026"], allowReplay: true });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

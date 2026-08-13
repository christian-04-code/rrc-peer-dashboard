const { test } = require("node:test");
const assert = require("node:assert/strict");

async function loadModules() {
  const [historicalWriter, financialsWriter, guidanceWriter, schema] = await Promise.all([
    import("../lib/sec-pipeline/historical-writer.mjs"),
    import("../lib/sec-pipeline/financials-writer.mjs"),
    import("../lib/sec-pipeline/guidance-writer.mjs"),
    import("../lib/sec-pipeline/candidate-schema.mjs"),
  ]);
  return { historicalWriter, financialsWriter, guidanceWriter, schema };
}

const SOURCE_META = { accessionNumber: "0001193125-26-999999", filingUrl: "data/sec/RRC/2026-09-30/x/filing.htm", filingType: "10-Q" };

function baseHistorical() {
  return {
    companies: {
      RRC: {
        metrics: {
          Revenue: { unit: "$mm", values: { "Q2 2026": 833.571 }, source_by_quarter: { "Q2 2026": "existing" } },
        },
      },
    },
  };
}

test("historical-writer: adds a value for a metric/quarter that doesn't have one yet", async () => {
  const { historicalWriter } = await loadModules();
  const result = historicalWriter.applyHistoricalUpdate(baseHistorical(), "RRC", "Q3 2026", [{ path: "financial.revenue", value: 900, classification: "A" }], SOURCE_META);
  assert.equal(result.written.length, 1);
  assert.equal(result.file.companies.RRC.metrics.Revenue.values["Q3 2026"], 900);
  assert.equal(result.conflicts.length, 0);
});

test("historical-writer: never overwrites an existing differing value -- reports a conflict instead", async () => {
  const { historicalWriter } = await loadModules();
  const result = historicalWriter.applyHistoricalUpdate(baseHistorical(), "RRC", "Q2 2026", [{ path: "financial.revenue", value: 999, classification: "A" }], SOURCE_META);
  assert.equal(result.written.length, 0);
  assert.equal(result.conflicts.length, 1);
  assert.equal(baseHistorical().companies.RRC.metrics.Revenue.values["Q2 2026"], 833.571); // original untouched
});

test("historical-writer: no-ops (doesn't write, doesn't conflict) when the proposed value already matches", async () => {
  const { historicalWriter } = await loadModules();
  const result = historicalWriter.applyHistoricalUpdate(baseHistorical(), "RRC", "Q2 2026", [{ path: "financial.revenue", value: 833.571, classification: "A" }], SOURCE_META);
  assert.equal(result.written.length, 0);
  assert.equal(result.conflicts.length, 0);
});

test("historical-writer: refuses to invent a company section that doesn't exist", async () => {
  const { historicalWriter } = await loadModules();
  assert.throws(() => historicalWriter.applyHistoricalUpdate(baseHistorical(), "ZZZ", "Q3 2026", [], SOURCE_META));
});

function fixtureFinancialsSource() {
  return `export const data = {
  RRC: {
    "Q1 2026": {
      ticker: "RRC",
      quarter: "Q1 2026",
      revenue: { value: 1034.17, source: "codex", basis: "actual" },
      adjustedEbitdax: { value: 569.529, source: "codex", basis: "actual" },
      capitalExpenditures: { value: 139, source: "codex", basis: "actual" },
      netDebt: { value: 833.753, source: "codex", basis: "derived" },
      production: {
        total: { value: 2207.436, source: "codex", basis: "actual" },
        naturalGas: { value: 1500, source: "codex", basis: "actual" },
        ngl: { value: 100, source: "codex", basis: "actual" },
        oilCondensate: { value: 5, source: "codex", basis: "actual" }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6, source: "codex", basis: "derived" },
        nglPct: { value: 0.3, source: "codex", basis: "derived" },
        oilCondensatePct: { value: 0.1, source: "codex", basis: "derived" }
      },
      realizedPrices: {
        naturalGas: { value: 5.18, source: "codex", basis: "actual" },
        ngl: { value: 26.62, source: "codex", basis: "actual" },
        oilCondensate: { value: 63.3, source: "codex", basis: "actual" }
      },
      costs: {
        leaseOperatingExpense: { value: 0.14, source: "codex", basis: "actual" },
        gatheringProcessingTransportation: { value: 1.63, source: "codex", basis: "actual" },
        cashGA: { value: 0.18, source: "codex", basis: "actual" },
        totalCashUnitCosts: { value: 1.97, source: "codex", basis: "derived" }
      },
      wells: {
        drilled: { value: 9, source: "codex", basis: "actual" },
        turnedInLine: { value: 17, source: "codex", basis: "actual" },
        ducInventory: { value: null, source: "codex", basis: "actual" }
      }
    },
  },
};
`;
}

function fullyResolvedCandidate(schema) {
  const identity = { ticker: "RRC", fiscalYear: 2026, fiscalQuarter: 2, filingType: "10-Q", filingDate: "2026-07-21", accessionNumber: "0001193125-26-310446", sourcePath: "x" };
  const candidate = schema.createCandidateSkeleton(identity);
  const f = (value, unit, classification = "A") => ({ ...schema.makeCandidateField({ value, unit, source: "sec-xbrl", extractionStatus: "extracted", classification, confidence: "high", notes: "n" }), action: classification === "C" ? "REVIEW_REQUIRED" : "AUTO_APPLY" });
  candidate.financial.revenue = f(833.571, "$MM");
  candidate.financial.adjustedEbitdax = f(349.059, "$MM");
  candidate.financial.capitalExpenditures = f(222, "$MM");
  candidate.financial.netDebt = f(880.753, "$MM", "B");
  candidate.production.total = f(2296.399, "MMcfe/d");
  candidate.production.naturalGas = f(1548.871, "MMcf/d");
  candidate.production.ngl = f(118.113, "Mbbl/d");
  candidate.production.oilCondensate = f(6.475, "Mbbl/d");
  candidate.pricing.realizedGas = f(2.79, "$/Mcf");
  candidate.pricing.realizedNgl = f(29.1, "$/bbl");
  candidate.pricing.realizedOil = f(83.96, "$/bbl");
  candidate.costs.leaseOperatingExpense = f(0.133, "$/Mcfe");
  candidate.costs.gatheringProcessingTransport = f(1.516, "$/Mcfe");
  candidate.costs.cashGA = f(0.2283, "$/Mcfe");
  candidate.costs.totalCashUnitCosts = f(1.9105, "$/Mcfe", "B");
  candidate.operating.wellsDrilled = f(null, null, "D");
  candidate.operating.wellsDrilled.action = "LEAVE_BLANK";
  candidate.operating.tils = f(21, "count");
  return candidate;
}

test("financials-writer: inserts a new quarter block for a ticker/quarter that doesn't exist yet, and the result is syntactically valid TS", async () => {
  const { financialsWriter, schema } = await loadModules();
  const ts = require("typescript");
  const candidate = fullyResolvedCandidate(schema);
  const result = financialsWriter.insertQuarterIntoFinancialsQuarterly(fixtureFinancialsSource(), candidate);
  assert.equal(result.inserted, true);
  assert.match(result.source, /"Q2 2026": \{/);
  assert.match(result.source, /revenue: \{ value: 833\.571/);
  // original Q1 2026 block must survive untouched
  assert.match(result.source, /"Q1 2026": \{/);
  assert.match(result.source, /value: 1034\.17/);
  // no stray whitespace-only line between the two quarter blocks
  assert.doesNotMatch(result.source, /\n[ \t]+\n/);

  const sourceFile = ts.createSourceFile("fixture.ts", result.source, ts.ScriptTarget.ES2022, true);
  const syntaxErrors = sourceFile.parseDiagnostics ?? [];
  assert.equal(syntaxErrors.length, 0, JSON.stringify(syntaxErrors));
});

test("financials-writer: refuses to modify an existing quarter block", async () => {
  const { financialsWriter, schema } = await loadModules();
  const candidate = fullyResolvedCandidate(schema);
  candidate.identity.quarterKey = "Q1 2026"; // already exists in the fixture
  const result = financialsWriter.insertQuarterIntoFinancialsQuarterly(fixtureFinancialsSource(), candidate);
  assert.equal(result.inserted, false);
  assert.match(result.reason, /already exists/);
  assert.equal(result.source, fixtureFinancialsSource()); // untouched
});

test("financials-writer: refuses a partially-reviewed quarter (REVIEW_REQUIRED fields remaining) unless allowPartial is set", async () => {
  const { financialsWriter, schema } = await loadModules();
  const candidate = fullyResolvedCandidate(schema);
  candidate.costs.cashGA.action = "REVIEW_REQUIRED";
  const blocked = financialsWriter.insertQuarterIntoFinancialsQuarterly(fixtureFinancialsSource(), candidate);
  assert.equal(blocked.inserted, false);
  assert.match(blocked.reason, /REVIEW_REQUIRED/);

  const allowed = financialsWriter.insertQuarterIntoFinancialsQuarterly(fixtureFinancialsSource(), candidate, { allowPartial: true });
  assert.equal(allowed.inserted, true);
  assert.match(allowed.source, /cashGA: \{ value: null, source: "sec-direct", basis: "actual", note: "REVIEW_REQUIRED, not yet resolved/); // left null with an explanatory note, not the proposed value
});

test("guidance-writer: appends new-cycle entries, never deletes old-cycle entries, and de-dupes repeated apply runs", async () => {
  const { guidanceWriter, schema } = await loadModules();
  const existing = { meta: { reportingCycle: "Q2 2026" }, companies: { RRC: { entries: [{ company: "RRC", metric: "capex", period: "FY 2026", reportingCycle: "Q1 2026", low: 900, high: 950 }] } } };
  const newEntry = schema.makeGuidanceCandidate({ metric: "capex", low: 900, midpoint: 925, high: 950, unit: "$MM", period: "FY 2026", status: "reaffirmed", reportingCycle: "Q3 2026", source: "Q3 2026 Earnings", directVsDerived: "direct", chartable: true });

  const first = guidanceWriter.applyGuidanceUpdate(existing, "RRC", [newEntry]);
  assert.equal(first.added, 1);
  assert.equal(first.file.companies.RRC.entries.length, 2);
  assert.equal(first.file.companies.RRC.entries[0].reportingCycle, "Q1 2026"); // stale entry preserved

  const second = guidanceWriter.applyGuidanceUpdate(first.file, "RRC", [newEntry]);
  assert.equal(second.added, 0);
  assert.equal(second.skippedDuplicates.length, 1);
});

test("guidance-writer: reports cycle-bump eligibility as a decision, never performs it automatically", async () => {
  const { guidanceWriter, schema } = await loadModules();
  const existing = { meta: { reportingCycle: "Q2 2026" }, companies: { RRC: { entries: [] }, AR: { entries: [] } } };
  const entry = schema.makeGuidanceCandidate({ metric: "capex", low: 900, high: 950, unit: "$MM", period: "FY 2026", status: "current", reportingCycle: "Q3 2026", source: "x", directVsDerived: "direct", chartable: true });
  const result = guidanceWriter.applyGuidanceUpdate(existing, "RRC", [entry]);
  assert.equal(result.cycleBumpEligible, false); // AR has no Q3 2026 entries yet
  assert.ok(result.cycleBumpBlockers.some((blocker) => blocker.includes("AR")));
  assert.equal(existing.meta.reportingCycle, "Q2 2026"); // never mutated automatically
});

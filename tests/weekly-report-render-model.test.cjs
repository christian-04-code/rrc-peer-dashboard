const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const { SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT } = load("tests/fixtures/weekly-report-fixture.ts");
const { buildWeeklyReportRenderModel } = load("lib/reports/render/render-model-builder.ts");
const { buildEvidenceSections } = load("lib/reports/render/evidence-sections.ts");
const { buildComparisonBarChart, buildMultiItemBarChart, buildPeerBarChart, buildActualVsForecastBarChart } = load("lib/reports/render/chart-selection.ts");
const { buildAtAGlanceTable, buildPeerComparisonTable, buildRisksOpportunitiesTable, buildSourcesFreshnessTable } = load("lib/reports/render/table-builder.ts");
const { composeRangeImplication, composeEvidenceCommentary } = load("lib/reports/render/commentary.ts");
const { STANDARD_BUDGET, REDUCED_BUDGET } = load("lib/reports/render/content-budget.ts");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// buildWeeklyReportRenderModel -- end-to-end render-model construction
// ---------------------------------------------------------------------------

test("buildWeeklyReportRenderModel produces the expected identity fields", () => {
  const model = buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT);
  assert.equal(model.identity.title, "WEEKLY RANGE RESOURCES AI INTELLIGENCE REPORT");
  assert.equal(model.identity.subtitle, "Market, Company & Peer Intelligence");
  assert.match(model.identity.weekEndingLabel, /August 28, 2026/);
  assert.match(model.identity.dataCutoffLabel, /September 3, 2026/);
});

test("buildWeeklyReportRenderModel splits the executiveAssessment into multiple paragraphs on the blank-line separator", () => {
  const model = buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT);
  assert.equal(model.executiveAssessmentParagraphs.length, 3);
  assert.match(model.executiveAssessmentParagraphs[0], /storage/i);
});

test("buildWeeklyReportRenderModel falls back to sentence-grouped paragraphs when no blank line is present", () => {
  const assessment = { ...SAMPLE_WEEKLY_ANALYST_ASSESSMENT, executiveAssessment: "First sentence here. Second sentence here. Third sentence here. Fourth sentence here." };
  const model = buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, assessment);
  assert.ok(model.executiveAssessmentParagraphs.length >= 2);
});

test("buildWeeklyReportRenderModel copies biggestRisk/biggestOpportunity/bottomLine directly from the assessment, never inventing them", () => {
  const model = buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT);
  assert.equal(model.biggestRisk.title, SAMPLE_WEEKLY_ANALYST_ASSESSMENT.biggestRisk.title);
  assert.equal(model.biggestOpportunity.body, SAMPLE_WEEKLY_ANALYST_ASSESSMENT.biggestOpportunity.assessment);
  assert.equal(model.bottomLine, SAMPLE_WEEKLY_ANALYST_ASSESSMENT.bottomLine);
});

test("buildWeeklyReportRenderModel caps whatChanged/managementWatchItems at the budget's own limits", () => {
  const manyChanges = new Array(10).fill(0).map((_, i) => ({ title: `Change ${i}`, assessment: "x", evidenceIds: ["storage:lower48"] }));
  const manyWatch = new Array(10).fill(0).map((_, i) => ({ item: `Watch ${i}`, reason: "x", evidenceIds: ["storage:lower48"] }));
  const assessment = { ...SAMPLE_WEEKLY_ANALYST_ASSESSMENT, whatChanged: manyChanges, managementWatchItems: manyWatch };
  const model = buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, assessment, "standard");
  assert.equal(model.whatChanged.length, STANDARD_BUDGET.maxWhatChangedItems);
  assert.equal(model.managementWatchItems.length, STANDARD_BUDGET.maxWatchItems);
});

test("buildWeeklyReportRenderModel respects the reduced budget tier's tighter caps", () => {
  const standard = buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT, "standard");
  const reduced = buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT, "reduced");
  assert.equal(reduced.budgetTier, "reduced");
  assert.ok(reduced.evidenceSections.length <= standard.evidenceSections.length);
  assert.ok(reduced.atAGlanceTable.rows.length <= standard.atAGlanceTable.rows.length);
});

test("buildWeeklyReportRenderModel never crashes on a payload missing every optional category", () => {
  const minimalPayload = clone(SAMPLE_WEEKLY_REPORT_PAYLOAD);
  minimalPayload.modules = { storage: minimalPayload.modules.storage, deterministic_risk_opportunity: minimalPayload.modules.deterministic_risk_opportunity };
  const model = buildWeeklyReportRenderModel(minimalPayload, SAMPLE_WEEKLY_ANALYST_ASSESSMENT);
  assert.ok(model.evidenceSections.length >= 1);
  assert.equal(model.atAGlanceTable.rows.length, 1);
});

// ---------------------------------------------------------------------------
// Evidence-section selection -- materiality-ranked, budget-capped
// ---------------------------------------------------------------------------

test("buildEvidenceSections never exceeds the budget's maxEvidenceSections, and lists the rest as omitted", () => {
  const { sections, omittedLabels } = buildEvidenceSections(SAMPLE_WEEKLY_REPORT_PAYLOAD, STANDARD_BUDGET);
  assert.ok(sections.length <= STANDARD_BUDGET.maxEvidenceSections);
  assert.ok(omittedLabels.length > 0, "this fixture has more candidate subjects than the standard budget allows");
});

test("buildEvidenceSections prioritizes a changed/high-materiality item over an unchanged, low-magnitude one", () => {
  const payload = clone(SAMPLE_WEEKLY_REPORT_PAYLOAD);
  // Force a tiny budget so only the single highest-materiality candidate survives.
  const tinyBudget = { ...STANDARD_BUDGET, maxEvidenceSections: 1 };
  const { sections } = buildEvidenceSections(payload, tinyBudget);
  assert.equal(sections.length, 1);
  // Storage carries a MODERATE_RISK state (riskRank 1) and a real comparison magnitude --
  // it must outrank routine, unchanged categories like industrial demand.
  assert.equal(sections[0].heading, "Storage");
});

test("buildEvidenceSections omits a category entirely when its payload module is empty, never zero-filling a section for it", () => {
  const payload = clone(SAMPLE_WEEKLY_REPORT_PAYLOAD);
  delete payload.modules.news;
  const { sections } = buildEvidenceSections(payload, STANDARD_BUDGET);
  assert.ok(!sections.some((s) => s.heading === "Material News"));
});

test("buildEvidenceSections' comparisonBar sections carry chart values that trace directly to the source evidence item", () => {
  const { sections } = buildEvidenceSections(SAMPLE_WEEKLY_REPORT_PAYLOAD, STANDARD_BUDGET);
  const storage = sections.find((s) => s.heading === "Storage");
  assert.ok(storage.chart);
  const currentBar = storage.chart.bars.find((b) => b.label === "Current");
  assert.equal(currentBar.value, 3212);
  const yearAgoBar = storage.chart.bars.find((b) => b.label === "1yr ago");
  assert.equal(yearAgoBar.value, 3050);
});

// ---------------------------------------------------------------------------
// Deterministic chart construction -- values only from frozen evidence
// ---------------------------------------------------------------------------

test("buildComparisonBarChart returns null when the item has no available comparison (nothing useful to chart)", () => {
  const item = { evidenceId: "x", category: "forecast_scenarios", metricKey: "x", label: "X", currentValue: 100, displayValue: "100", unit: null, period: null, asOfDate: null, sourceIds: [], freshness: "current", comparisons: [], rangeDrivers: [], materialityInputs: {}, metadata: {} };
  assert.equal(buildComparisonBarChart(item), null);
});

test("buildComparisonBarChart returns null when currentValue is null (nothing real to chart)", () => {
  const item = { evidenceId: "x", category: "news", metricKey: "article", label: "X", currentValue: null, displayValue: "--", unit: null, period: null, asOfDate: null, sourceIds: [], freshness: "current", comparisons: [], rangeDrivers: [], materialityInputs: {}, metadata: {} };
  assert.equal(buildComparisonBarChart(item), null);
});

test("buildComparisonBarChart never invents a bar value -- every bar traces to currentValue or a real comparison.previousValue", () => {
  const item = SAMPLE_WEEKLY_REPORT_PAYLOAD.modules.storage[0];
  const chart = buildComparisonBarChart(item);
  const expectedValues = [item.currentValue, ...item.comparisons.filter((c) => c.direction !== "unavailable").map((c) => c.previousValue)];
  for (const bar of chart.bars) {
    assert.ok(expectedValues.includes(bar.value), `bar value ${bar.value} must trace to the source item`);
  }
});

test("buildMultiItemBarChart returns null with fewer than 2 real-valued items", () => {
  const oneItem = [{ evidenceId: "x", category: "rigs", metricKey: "x", label: "X", currentValue: 5, displayValue: "5", unit: "rigs", period: null, asOfDate: null, sourceIds: [], freshness: "current", comparisons: [], rangeDrivers: [], materialityInputs: {}, metadata: {} }];
  assert.equal(buildMultiItemBarChart("id", "title", oneItem), null);
});

test("buildPeerBarChart returns null when Range's own side of the metric is missing", () => {
  const payload = clone(SAMPLE_WEEKLY_REPORT_PAYLOAD);
  payload.modules.range_company = payload.modules.range_company.filter((i) => i.metricKey !== "revenue");
  assert.equal(buildPeerBarChart(payload, "revenue", "revenue", "Revenue"), null);
});

test("buildPeerBarChart returns null when no peer carries the metric", () => {
  const payload = clone(SAMPLE_WEEKLY_REPORT_PAYLOAD);
  assert.equal(buildPeerBarChart(payload, "revenue", "nonexistent_metric", "Revenue"), null);
});

test("buildPeerBarChart's RRC bar is always first and carries Range's own real value", () => {
  const chart = buildPeerBarChart(SAMPLE_WEEKLY_REPORT_PAYLOAD, "revenue", "revenue", "Revenue");
  assert.equal(chart.bars[0].label, "RRC");
  assert.equal(chart.bars[0].value, 512);
});

test("buildActualVsForecastBarChart returns null when either side is missing", () => {
  const payload = clone(SAMPLE_WEEKLY_REPORT_PAYLOAD);
  delete payload.modules.forecast_scenarios;
  assert.equal(buildActualVsForecastBarChart(payload, "revenue", "default_scenario_revenue", "Revenue"), null);
});

// ---------------------------------------------------------------------------
// Table construction -- caps, omission, no fabricated cells
// ---------------------------------------------------------------------------

test("buildAtAGlanceTable is diversity-aware -- at most one representative per category", () => {
  const table = buildAtAGlanceTable(SAMPLE_WEEKLY_REPORT_PAYLOAD, STANDARD_BUDGET);
  const labels = table.rows.map((r) => r.metric);
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(table.rows.length <= STANDARD_BUDGET.maxAtAGlanceMetrics);
});

test("buildAtAGlanceTable respects the budget cap and truncates deterministically", () => {
  const tinyBudget = { ...STANDARD_BUDGET, maxAtAGlanceMetrics: 2 };
  const table = buildAtAGlanceTable(SAMPLE_WEEKLY_REPORT_PAYLOAD, tinyBudget);
  assert.equal(table.rows.length, 2);
});

test("buildPeerComparisonTable returns null when there is no peer data at all", () => {
  const payload = clone(SAMPLE_WEEKLY_REPORT_PAYLOAD);
  delete payload.modules.peers;
  assert.equal(buildPeerComparisonTable(payload, STANDARD_BUDGET), null);
});

test("buildPeerComparisonTable never fabricates a missing peer metric -- renders '--' instead", () => {
  const table = buildPeerComparisonTable(SAMPLE_WEEKLY_REPORT_PAYLOAD, STANDARD_BUDGET);
  const cnxRow = table.rows.find((r) => r.company === "CNX");
  assert.equal(cnxRow.adjusted_ebitdax, "--");
});

test("buildPeerComparisonTable caps peer rows at budget.maxPeerCompanies and reports the truncated count", () => {
  const tinyBudget = { ...STANDARD_BUDGET, maxPeerCompanies: 2 };
  const table = buildPeerComparisonTable(SAMPLE_WEEKLY_REPORT_PAYLOAD, tinyBudget);
  assert.equal(table.rows.length, 3); // RRC + 2 peers
  assert.ok(table.truncatedCount > 0);
});

test("buildRisksOpportunitiesTable sorts by the deterministic risk engine's own rank", () => {
  const table = buildRisksOpportunitiesTable(SAMPLE_WEEKLY_REPORT_PAYLOAD, STANDARD_BUDGET);
  const ranks = table.rows.map((r) => Number(r.rank));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test("buildSourcesFreshnessTable truncates deterministically and reports what was dropped", () => {
  const tinyBudget = { ...STANDARD_BUDGET, maxSourceRows: 3 };
  const table = buildSourcesFreshnessTable(SAMPLE_WEEKLY_REPORT_PAYLOAD, tinyBudget);
  assert.equal(table.rows.length, 3);
  assert.equal(table.truncatedCount, SAMPLE_WEEKLY_REPORT_PAYLOAD.sourceManifest.generatedFrom.length - 3);
});

// ---------------------------------------------------------------------------
// Commentary / Range Implication -- deterministic, evidence-grounded only
// ---------------------------------------------------------------------------

test("composeEvidenceCommentary's first sentence always states the current value and period", () => {
  const item = SAMPLE_WEEKLY_REPORT_PAYLOAD.modules.gas_pricing[0];
  const sentences = composeEvidenceCommentary(item, 3);
  assert.match(sentences[0], /\$3\.42\/MMBtu/);
  assert.match(sentences[0], /2026-08-28/);
});

test("composeEvidenceCommentary respects the maxSentences budget", () => {
  const item = SAMPLE_WEEKLY_REPORT_PAYLOAD.modules.storage[0];
  const sentences = composeEvidenceCommentary(item, 2);
  assert.equal(sentences.length, 2);
});

test("composeRangeImplication returns null for a low-materiality item even when a template exists for its category", () => {
  const routineItem = {
    ...SAMPLE_WEEKLY_REPORT_PAYLOAD.modules.gas_pricing[0],
    materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 1.2 }
  };
  assert.equal(composeRangeImplication(routineItem), null);
});

test("composeRangeImplication returns null when no template exists for the item's category", () => {
  const item = SAMPLE_WEEKLY_REPORT_PAYLOAD.modules.range_company[0];
  assert.equal(composeRangeImplication(item), null);
});

test("composeRangeImplication for News restates the item's own real, already-persisted rangeImpactDirection/Strength -- never derives a new one", () => {
  const item = SAMPLE_WEEKLY_REPORT_PAYLOAD.modules.news[0];
  const implication = composeRangeImplication(item);
  assert.match(implication, /moderate positive/);
  assert.match(implication, new RegExp(item.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

// ---------------------------------------------------------------------------
// Source-inspection guardrails -- the renderer must stay a pure consumer
// ---------------------------------------------------------------------------

function readRenderSourceFiles() {
  const dir = path.resolve(__dirname, "../lib/reports/render");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => ({ file: f, source: fs.readFileSync(path.join(dir, f), "utf8") }));
}

test("no file under lib/reports/render imports the AI provider/prompt layer -- the renderer never calls AI", () => {
  for (const { file, source } of readRenderSourceFiles()) {
    assert.doesNotMatch(source, /anthropic-provider|ai\/prompt|@anthropic-ai\/sdk/, `${file} must not import the AI layer`);
  }
});

test("no file under lib/reports/render imports the persistence/DB layer -- the renderer never queries a DB or live data itself", () => {
  for (const { file, source } of readRenderSourceFiles()) {
    assert.doesNotMatch(source, /from "pg"|persistence\/report-repo|persistence\/analysis-repo|from "@\/lib\/persistence\/db"/, `${file} must not import the DB/persistence layer`);
  }
});

test("no file under lib/reports/render calls publishSnapshot -- publication remains Phase 7E+'s job", () => {
  for (const { file, source } of readRenderSourceFiles()) {
    assert.doesNotMatch(source, /publishSnapshot/, `${file} must not call publishSnapshot`);
  }
});

test("no app/api route can trigger PDF generation -- the only lib/reports/render/* module any route may import is artifact-store (storage I/O, not a generator)", () => {
  // Phase 7D's original version of this guard blocked ANY import from
  // lib/reports/render/, back when nothing under it was meant to be
  // reachable from a route yet. Phase 7E legitimately arrived at the one
  // intended exception: app/api/reports/latest/download/route.ts reads
  // already-stored bytes via artifact-store.ts's ArtifactStorageProvider
  // -- see lib/reports/latest-report-service.ts, which is what's actually
  // unit-tested for that route's real logic. Matching actual import PATHS
  // (not bare English words like "commentary" or "branding", which show up
  // completely unrelated in other routes' own doc comments -- e.g.
  // macro/risk/route.ts's own docstring uses the word "commentary") is
  // what keeps this check precise rather than a source of false positives.
  function listFilesRecursive(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFilesRecursive(full) : [full];
    });
  }
  const apiDir = path.resolve(__dirname, "../app/api");
  const files = listFilesRecursive(apiDir).filter((file) => /\.(ts|tsx|js)$/.test(file));
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const renderImports = [...source.matchAll(/from\s+["']@\/lib\/reports\/render\/([^"']+)["']/g)].map((m) => m[1]);
    for (const imported of renderImports) {
      assert.equal(imported, "artifact-store", `${file} imports "${imported}" from lib/reports/render/ -- only artifact-store is allowed from a route`);
    }
  }
});

test("the download route only ever reads (get), never writes (put), an artifact", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../app/api/reports/latest/download/route.ts"), "utf8");
  assert.doesNotMatch(source, /\.put\(/);
});

test("vercel.json still declares exactly the two pre-existing crons -- Phase 7D added no scheduled orchestration", () => {
  const vercelConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../vercel.json"), "utf8"));
  assert.equal(vercelConfig.crons.length, 2);
  assert.deepEqual(vercelConfig.crons.map((c) => c.path).sort(), ["/api/cron/macro", "/api/cron/news"]);
});

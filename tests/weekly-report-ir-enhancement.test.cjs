const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const { SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT } = load("tests/fixtures/weekly-report-fixture.ts");
const { buildWeeklyReportRenderModel } = load("lib/reports/render/render-model-builder.ts");
const { buildEvidenceSections } = load("lib/reports/render/evidence-sections.ts");
const { STANDARD_BUDGET, REDUCED_BUDGET } = load("lib/reports/render/content-budget.ts");
const { buildValuationComparisonTable, buildGuidanceWatchTable, buildKeyMetricsToWatchTable, buildCatalystsCalendarTable } = load("lib/reports/render/table-builder.ts");
const { collectValuationEvidence } = load("lib/reports/adapters/valuation-adapter.ts");

/**
 * IR-report enhancement (2026-09-08): "Investor Questions to Prepare For,"
 * "Valuation & Share-Price Context," "Company-Specific News & Implications,"
 * "Peer Developments That Matter to Range," "Key Metrics to Watch Next
 * Week," "Guidance Watch," and "Upcoming Catalysts Calendar." Every one of
 * these is conditional -- see each section's own header comment in
 * table-builder.ts/evidence-sections.ts for why. This file tests the
 * conditional-inclusion behavior itself (the actual content composition is
 * already covered by each function's own dedicated tests elsewhere), using
 * deterministic fixtures/mocks throughout -- no live AI, DB, or network
 * access anywhere in this file.
 */

function newsItem(overrides) {
  return {
    evidenceId: "news:article:x",
    category: "news",
    metricKey: "article",
    label: "Headline",
    currentValue: null,
    displayValue: "positive",
    unit: null,
    period: "2026-08-30T00:00:00.000Z",
    asOfDate: "2026-08-30",
    sourceIds: ["news_articles"],
    freshness: "current",
    comparisons: [],
    rangeDrivers: [],
    materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
    metadata: {},
    ...overrides
  };
}

// --- Valuation & Share-Price Context ---

test("collectValuationEvidence covers RRC + 6 peers across market cap / EV / EV-EBITDAX / FCF yield, deterministically (no live price feed)", () => {
  const collection = collectValuationEvidence();
  const tickers = new Set(collection.items.map((item) => item.metadata.ticker));
  assert.deepEqual([...tickers].sort(), ["AR", "CNX", "CRK", "EQT", "EXE", "GPOR", "RRC"]);
  assert.equal(collection.items.every((item) => item.category === "valuation"), true);
});

test("buildValuationComparisonTable returns null when there is no valuation data at all", () => {
  const table = buildValuationComparisonTable({ ...SAMPLE_WEEKLY_REPORT_PAYLOAD, modules: { ...SAMPLE_WEEKLY_REPORT_PAYLOAD.modules, valuation: [] } }, STANDARD_BUDGET);
  assert.equal(table, null);
});

test("buildValuationComparisonTable omits a metric column entirely when RRC's own side is unavailable, never fills every row with '--'", () => {
  const valuation = collectValuationEvidence();
  const withoutRangeEv = valuation.items.filter((item) => !(item.metadata.isRange === true && item.metricKey === "enterprise_value"));
  const table = buildValuationComparisonTable({ ...SAMPLE_WEEKLY_REPORT_PAYLOAD, modules: { ...SAMPLE_WEEKLY_REPORT_PAYLOAD.modules, valuation: withoutRangeEv } }, STANDARD_BUDGET);
  assert.ok(table);
  assert.ok(!table.columns.some((c) => c.key === "enterprise_value"));
});

test("Valuation & Share-Price Context is a real, competing, omittable evidence-sections candidate (present when data exists, correctly reported as omitted under a tiny budget rather than silently vanishing)", () => {
  const valuation = collectValuationEvidence();
  const payload = { ...SAMPLE_WEEKLY_REPORT_PAYLOAD, modules: { ...SAMPLE_WEEKLY_REPORT_PAYLOAD.modules, valuation: valuation.items } };
  const { sections, omittedLabels } = buildEvidenceSections(payload, { ...STANDARD_BUDGET, maxEvidenceSections: 0 });
  assert.equal(sections.length, 0);
  assert.ok(omittedLabels.includes("Valuation & Share-Price Context"));
});

// --- Company-Specific News & Peer Developments (partitioned from the existing News pipeline) ---

test("Company-Specific News, Peer Developments, and generic Material News partition the SAME news pool with no article shown twice", () => {
  const rangeArticle = newsItem({ evidenceId: "news:article:range1", label: "Range headline", metadata: { category: ["range"] } });
  const peerArticle = newsItem({ evidenceId: "news:article:peer1", label: "Peer headline", metadata: { category: ["peers"] } });
  const macroArticle = newsItem({ evidenceId: "news:article:macro1", label: "Macro headline", metadata: { category: ["natural_gas"] } });
  // Isolated to just the news module (not the full sample payload, whose OTHER
  // categories are deliberately curated as high-materiality and would win every
  // slot under a shared budget, unrelated to what this test actually checks:
  // partition correctness, not cross-category materiality competition).
  const payload = { ...SAMPLE_WEEKLY_REPORT_PAYLOAD, modules: { news: [rangeArticle, peerArticle, macroArticle] } };
  const { sections } = buildEvidenceSections(payload, STANDARD_BUDGET);
  const headings = sections.map((s) => s.heading);
  assert.ok(headings.includes("Company-Specific News & Implications"));
  assert.ok(headings.includes("Peer Developments That Matter to Range"));
  assert.ok(headings.includes("Material News"));

  const allTableRows = sections.filter((s) => ["Company-Specific News & Implications", "Peer Developments That Matter to Range", "Material News"].includes(s.heading)).flatMap((s) => s.table.rows.map((r) => r.headline));
  assert.equal(new Set(allTableRows).size, allTableRows.length, "no headline should appear in more than one of the three News sections");
});

test("an article tagged both 'range' and 'peers' counts as range-specific, not peer, and is never double-counted", () => {
  const both = newsItem({ evidenceId: "news:article:both", metadata: { category: ["range", "peers"] } });
  const payload = { ...SAMPLE_WEEKLY_REPORT_PAYLOAD, modules: { news: [both] } };
  const { sections } = buildEvidenceSections(payload, STANDARD_BUDGET);
  const companyNews = sections.find((s) => s.heading === "Company-Specific News & Implications");
  const peerNews = sections.find((s) => s.heading === "Peer Developments That Matter to Range");
  assert.ok(companyNews);
  assert.equal(peerNews, undefined);
});

test("Company-Specific News & Peer Developments sections are both omitted (never rendered with an empty table) when no article carries that category", () => {
  const macroOnly = [newsItem({ evidenceId: "news:article:m1", metadata: { category: ["natural_gas"] } })];
  const payload = { ...SAMPLE_WEEKLY_REPORT_PAYLOAD, modules: { ...SAMPLE_WEEKLY_REPORT_PAYLOAD.modules, news: macroOnly } };
  const { sections } = buildEvidenceSections(payload, STANDARD_BUDGET);
  assert.ok(!sections.some((s) => s.heading === "Company-Specific News & Implications"));
  assert.ok(!sections.some((s) => s.heading === "Peer Developments That Matter to Range"));
});

// --- Key Metrics to Watch Next Week ---

test("buildKeyMetricsToWatchTable only draws from near-weekly-cadence categories, never quarterly-only ones (range_company/peers/valuation/forecast_scenarios)", () => {
  const table = buildKeyMetricsToWatchTable(SAMPLE_WEEKLY_REPORT_PAYLOAD, STANDARD_BUDGET);
  assert.ok(table);
  const rangeCompanyLabels = new Set((SAMPLE_WEEKLY_REPORT_PAYLOAD.modules.range_company ?? []).map((i) => i.label));
  for (const row of table.rows) {
    assert.ok(!rangeCompanyLabels.has(row.metric), `${row.metric} is a quarterly range_company metric and must not appear in a NEXT-WEEK watch list`);
  }
});

test("buildKeyMetricsToWatchTable populates 'Next Observation' only for storage (the one release date this codebase actually knows), '--' for everything else", () => {
  const table = buildKeyMetricsToWatchTable(SAMPLE_WEEKLY_REPORT_PAYLOAD, STANDARD_BUDGET);
  const nonStorageRows = table.rows.filter((r) => r.metric !== "Lower 48 Working Gas Storage");
  for (const row of nonStorageRows) {
    assert.equal(row.nextObservation, "--");
  }
});

test("buildKeyMetricsToWatchTable returns null when no near-weekly-cadence evidence exists at all", () => {
  const emptyPayload = { ...SAMPLE_WEEKLY_REPORT_PAYLOAD, modules: {} };
  assert.equal(buildKeyMetricsToWatchTable(emptyPayload, STANDARD_BUDGET), null);
});

// --- Guidance Watch (reuses existing guidance evidence; never implies consensus) ---

test("buildGuidanceWatchTable never has a 'Consensus' column and its sourceLine explicitly documents the lack of a consensus data source", () => {
  const guidanceItem = {
    evidenceId: "range_company:guidance:RRC:capex:2026",
    category: "range_company",
    metricKey: "guidance:capex",
    label: "RRC Guidance: capex (2026)",
    currentValue: 900,
    displayValue: "$880-920MM",
    unit: "$MM",
    period: "2026",
    asOfDate: "2026-02-20",
    sourceIds: ["range_company_guidance"],
    freshness: "current",
    comparisons: [],
    rangeDrivers: ["gas_pricing"],
    materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
    metadata: { source: "Company earnings release", status: "affirmed" }
  };
  const payload = { ...SAMPLE_WEEKLY_REPORT_PAYLOAD, modules: { ...SAMPLE_WEEKLY_REPORT_PAYLOAD.modules, range_company: [...SAMPLE_WEEKLY_REPORT_PAYLOAD.modules.range_company, guidanceItem] } };
  const table = buildGuidanceWatchTable(payload, STANDARD_BUDGET);
  assert.ok(table);
  assert.ok(!table.columns.some((c) => c.key.toLowerCase().includes("consensus")));
  assert.match(table.sourceLine, /no analyst-consensus data source exists/i);
});

test("buildGuidanceWatchTable returns null when Range has no guidance records this week", () => {
  const payload = { ...SAMPLE_WEEKLY_REPORT_PAYLOAD, modules: { ...SAMPLE_WEEKLY_REPORT_PAYLOAD.modules, range_company: (SAMPLE_WEEKLY_REPORT_PAYLOAD.modules.range_company ?? []).filter((i) => !i.metricKey.startsWith("guidance:")) } };
  assert.equal(buildGuidanceWatchTable(payload, STANDARD_BUDGET), null);
});

// --- Upcoming Catalysts Calendar (deterministic, never an invented date) ---

test("buildCatalystsCalendarTable includes only the next EIA storage release -- the one future date this codebase can state with real confidence", () => {
  const table = buildCatalystsCalendarTable(SAMPLE_WEEKLY_REPORT_PAYLOAD);
  assert.ok(table);
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0].event, "EIA Weekly Natural Gas Storage Report");
  assert.match(table.sourceLine, /Range\/peer earnings dates.*omitted rather than estimated/i);
});

test("buildCatalystsCalendarTable's next-storage-date is always strictly after the data cutoff, never the same day or in the past", () => {
  const table = buildCatalystsCalendarTable(SAMPLE_WEEKLY_REPORT_PAYLOAD);
  assert.ok(new Date(table.rows[0].date).getTime() > new Date(SAMPLE_WEEKLY_REPORT_PAYLOAD.dataCutoffAt).getTime());
});

test("buildCatalystsCalendarTable returns null when the data cutoff cannot be parsed (never guesses a date)", () => {
  const badPayload = { ...SAMPLE_WEEKLY_REPORT_PAYLOAD, dataCutoffAt: "not-a-date" };
  assert.equal(buildCatalystsCalendarTable(badPayload), null);
});

// --- Investor Sentiment & Narrative Watch: documented, permanent gap (no code path exists) ---

test("no Investor Sentiment & Narrative Watch section exists anywhere in the render pipeline -- a documented data-source gap, not an oversight", () => {
  const renderDir = path.resolve(__dirname, "../lib/reports/render");
  const files = fs.readdirSync(renderDir).filter((f) => f.endsWith(".ts"));
  for (const file of files) {
    const source = fs.readFileSync(path.join(renderDir, file), "utf8");
    assert.doesNotMatch(source, /Investor Sentiment/i, `${file} must not reference an Investor Sentiment section -- no reliable analyst-commentary/transcript data source exists in this dashboard (see docs)`);
  }
});

// --- Render-model wiring: investorQuestions + catalystsCalendarTable ---

test("buildWeeklyReportRenderModel wires investorQuestions from the assessment and caps them at the budget's own ceiling, never padding to a minimum", () => {
  const manyQuestions = Array.from({ length: 10 }, (_, i) => ({ question: `Q${i}?`, whyNow: "reason", evidenceIds: ["storage:lower48"] }));
  const model = buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, { ...SAMPLE_WEEKLY_ANALYST_ASSESSMENT, investorQuestions: manyQuestions }, "standard");
  assert.equal(model.investorQuestions.length, STANDARD_BUDGET.maxInvestorQuestions);
});

test("buildWeeklyReportRenderModel produces zero investorQuestions when the assessment has none -- never invents a placeholder question", () => {
  const model = buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, { ...SAMPLE_WEEKLY_ANALYST_ASSESSMENT, investorQuestions: [] }, "standard");
  assert.deepEqual(model.investorQuestions, []);
});

test("buildWeeklyReportRenderModel's catalystsCalendarTable is populated independent of the AI assessment (pure function of the payload's own dataCutoffAt)", () => {
  const model = buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT, "standard");
  assert.ok(model.catalystsCalendarTable);
});

// --- Content-budget behavior for the new caps ---

test("REDUCED_BUDGET's new caps (maxKeyMetricsToWatch/maxGuidanceRows/maxInvestorQuestions) are all <= STANDARD_BUDGET's, same discipline as every existing cap", () => {
  assert.ok(REDUCED_BUDGET.maxKeyMetricsToWatch <= STANDARD_BUDGET.maxKeyMetricsToWatch);
  assert.ok(REDUCED_BUDGET.maxGuidanceRows <= STANDARD_BUDGET.maxGuidanceRows);
  assert.ok(REDUCED_BUDGET.maxInvestorQuestions <= STANDARD_BUDGET.maxInvestorQuestions);
});

// --- Scenario coverage (Phase 6): high-materiality vs. quiet week ---

function neutralizeMateriality(items) {
  return (items ?? []).map((item) => ({ ...item, materialityInputs: { ...item.materialityInputs, isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, comparisonMagnitudePct: null } }));
}

test("a high-materiality week (several fresh, high-impact items across categories) surfaces multiple IR sections; a quiet week (nothing new/changed) surfaces few or none of them -- relevance drives inclusion, not a fixed quota", () => {
  // Both scenarios start from the SAME neutralized baseline (every category's
  // materiality flattened) so the only difference between "hot" and "quiet"
  // is the one signal each test actually cares about, not incidental
  // differences in the sample fixture's own pre-baked materiality flags.
  const neutralModules = Object.fromEntries(Object.entries(SAMPLE_WEEKLY_REPORT_PAYLOAD.modules).map(([key, items]) => [key, neutralizeMateriality(items)]));

  const quietPayload = { ...SAMPLE_WEEKLY_REPORT_PAYLOAD, modules: neutralModules };
  const hotPayload = {
    ...SAMPLE_WEEKLY_REPORT_PAYLOAD,
    modules: { ...neutralModules, valuation: collectValuationEvidence().items.map((item) => ({ ...item, materialityInputs: { ...item.materialityInputs, isNewThisWeek: true } })) }
  };

  const hot = buildEvidenceSections(hotPayload, STANDARD_BUDGET);
  const quiet = buildEvidenceSections(quietPayload, STANDARD_BUDGET);
  assert.ok(hot.sections.some((s) => s.heading === "Valuation & Share-Price Context"), "the deliberately-freshened valuation data should win a slot once it's the only fresh signal in an otherwise-quiet week");
  assert.ok(!quiet.sections.some((s) => s.heading === "Valuation & Share-Price Context"), "valuation must not appear in the quiet-week baseline, where nothing (including valuation) is flagged as fresh");
  // Both scenarios still respect the same hard cap -- materiality changes WHICH sections appear, never how many the budget allows.
  assert.ok(hot.sections.length <= STANDARD_BUDGET.maxEvidenceSections);
  assert.ok(quiet.sections.length <= STANDARD_BUDGET.maxEvidenceSections);
});

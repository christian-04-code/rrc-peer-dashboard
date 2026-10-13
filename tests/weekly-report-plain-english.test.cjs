const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

// Plain-English report pass (2026-10-13): impact tags, risk table, trend-chart
// series, and the redesigned template.

const { validateWeeklyAnalystAssessment, WeeklyAnalystValidationError } = load("lib/reports/ai-contract.ts");
const { buildRiskTable, buildMarketCharts, buildRangeFcfChart, buildPeerPanels, buildKpiTiles, buildChartGaps } = load("lib/reports/render/plain-report-sections.ts");
const { buildMacroChartSeries } = load("lib/reports/adapters/macro-adapter.ts");
const { buildStorageComparison } = load("lib/market/macro-analytics.ts");
const { collectRangeCompanyEvidence } = load("lib/reports/adapters/range-company-adapter.ts");
const { buildWeeklyReportRenderModel } = load("lib/reports/render/render-model-builder.ts");
const { renderReportHtml } = load("lib/reports/render/html-template.ts");
const { renderLineChartSvg, renderPeerPanelSvg } = load("lib/reports/render/report-charts.ts");
const { SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT } = load("tests/fixtures/weekly-report-fixture.ts");

const RISK_A = "deterministic_risk_opportunity:us_gas_supply";
const RISK_B = "deterministic_risk_opportunity:storage_levels";
const HEDGING = "range_company:guidance:RRC:hedging_summary:2H 2026";

function input(overrides = {}) {
  return {
    schemaVersion: "1.3.0",
    report: { storageWeekEnding: "2026-10-02", dataCutoffAt: "2026-10-09T17:00:00.000Z" },
    marketBackdrop: [],
    riskCandidates: [
      { evidenceId: RISK_A, driver: "us_gas_supply", label: "U.S. Gas Supply", state: "MODERATE_RISK", rank: 1, reason: "Supply +5.3% YoY." },
      { evidenceId: RISK_B, driver: "storage_levels", label: "Storage", state: "WATCH", rank: 2, reason: "Storage near normal." }
    ],
    opportunityCandidates: [{ evidenceId: "deterministic_risk_opportunity:gas_pricing", driver: "gas_pricing", label: "Pricing", state: "SUPPORTIVE", rank: 3, reason: "HH up." }],
    whatChanged: [{ kind: "value_changed", evidenceId: "storage:lower48", category: "storage", label: "Storage", fromValue: "3,415 Bcf", toValue: "3,500 Bcf", fromState: null, toState: null }],
    range: [],
    peers: [],
    news: [],
    outlook: [],
    sourcesFreshness: [],
    previousReportContext: null,
    rangeAnnouncements: [{ evidenceId: HEDGING, category: "range_company", label: "RRC Guidance: hedging", displayValue: ">25% hedged", period: "2H 2026" }],
    evidenceAllowlist: [RISK_A, RISK_B, "deterministic_risk_opportunity:gas_pricing", "storage:lower48", HEDGING],
    ...overrides
  };
}

function output(overrides = {}) {
  return {
    schemaVersion: "1.3.0",
    aiProvider: "anthropic",
    aiModel: "claude-haiku-4-5",
    generatedAt: "2026-10-09T17:05:00.000Z",
    executiveAssessment: new Array(110).fill("word").join(" "),
    biggestRisk: { title: "Supply", assessment: "Supply is growing faster than demand.", evidenceIds: [RISK_A] },
    biggestOpportunity: { title: "Prices", assessment: "Prices are higher than a month ago.", evidenceIds: ["deterministic_risk_opportunity:gas_pricing"] },
    whatChanged: [{ title: "Storage rose", assessment: "Storage rose to 3,500 Bcf.", evidenceIds: ["storage:lower48"], impact: "mixed" }],
    managementWatchItems: [{ item: "Next storage report", reason: "Shows whether storage stays near normal.", evidenceIds: ["storage:lower48"] }],
    bottomLine: "A steady week for Range with supply growth the main risk.",
    selectedEvidenceIds: [RISK_A, "storage:lower48"],
    investorQuestions: [],
    riskTable: [
      { evidenceId: RISK_A, whyItMatters: "More supply can lower prices.", announcedAction: "Range has hedged more than 25% of 2H 2026 gas.", announcedActionEvidenceIds: [HEDGING], possibleResponse: "Could consider adding 2027 hedges." },
      { evidenceId: RISK_B, whyItMatters: "Storage is close to normal." }
    ],
    ...overrides
  };
}

test("accepts a response with impact tags and a grounded risk table", () => {
  const result = validateWeeklyAnalystAssessment(output(), input());
  assert.equal(result.whatChanged[0].impact, "mixed");
  assert.equal(result.riskTable.length, 2);
});

test("a response without riskTable or impact (pre-1.3.0 shape) still validates", () => {
  const legacy = output({ whatChanged: [{ title: "Storage rose", assessment: "Storage rose.", evidenceIds: ["storage:lower48"] }] });
  delete legacy.riskTable;
  assert.deepEqual(validateWeeklyAnalystAssessment(legacy, input()).riskTable, []);
});

test("rejects an impact value outside positive/negative/mixed", () => {
  const bad = output({ whatChanged: [{ title: "Storage rose", assessment: "Storage rose.", evidenceIds: ["storage:lower48"], impact: "great" }] });
  assert.throws(() => validateWeeklyAnalystAssessment(bad, input()), WeeklyAnalystValidationError);
});

test("rejects a risk row that does not explain a supplied risk candidate", () => {
  const bad = output({ riskTable: [{ evidenceId: "deterministic_risk_opportunity:gas_pricing", whyItMatters: "Opportunity, not a risk." }] });
  assert.throws(() => validateWeeklyAnalystAssessment(bad, input()), /not one of the supplied deterministic risk candidates/);
});

test("rejects the same risk listed twice", () => {
  const bad = output({ riskTable: [{ evidenceId: RISK_A, whyItMatters: "One." }, { evidenceId: RISK_A, whyItMatters: "Two." }] });
  assert.throws(() => validateWeeklyAnalystAssessment(bad, input()), /more than once/);
});

test("an announced action must cite Range guidance or News -- never another evidence type, never nothing", () => {
  const uncited = output({ riskTable: [{ evidenceId: RISK_A, whyItMatters: "x", announcedAction: "Range will hedge more." }] });
  assert.throws(() => validateWeeklyAnalystAssessment(uncited, input()), /must cite announcedActionEvidenceIds/);
  const wrongSource = output({ riskTable: [{ evidenceId: RISK_A, whyItMatters: "x", announcedAction: "Storage rose.", announcedActionEvidenceIds: ["storage:lower48"] }] });
  assert.throws(() => validateWeeklyAnalystAssessment(wrongSource, input()), /only supplied Range guidance or News/);
});

test("rejects a risk-table cell longer than 1-2 short sentences", () => {
  const bad = output({ riskTable: [{ evidenceId: RISK_A, whyItMatters: "word ".repeat(80) }] });
  assert.throws(() => validateWeeklyAnalystAssessment(bad, input()), /1-2 short sentences/);
});

function riskItem(driver, state, rank) {
  return { evidenceId: `deterministic_risk_opportunity:${driver}`, category: "deterministic_risk_opportunity", metricKey: driver, label: driver, currentValue: 1, displayValue: state, unit: "%", period: null, asOfDate: null, sourceIds: [], freshness: "current", comparisons: [], rangeDrivers: [driver], materialityInputs: {}, metadata: { riskRank: rank, riskState: state, deterministicReason: `${driver} engine reason` } };
}

test("buildRiskTable takes risks and levels from the risk engine, in engine rank order, and never lists a SUPPORTIVE signal", () => {
  const payload = { ...SAMPLE_WEEKLY_REPORT_PAYLOAD, modules: { deterministic_risk_opportunity: [riskItem("storage_levels", "WATCH", 3), riskItem("gas_pricing", "SUPPORTIVE", 4), riskItem("us_gas_supply", "HIGH_RISK", 1), riskItem("lng_demand", "MODERATE_RISK", 2)] } };
  const rows = buildRiskTable(payload, { ...SAMPLE_WEEKLY_ANALYST_ASSESSMENT, riskTable: undefined }, 5);
  assert.deepEqual(rows.map((r) => r.level), ["High", "Medium", "Low"]);
  assert.equal(rows[0].risk, "U.S. gas supply growing faster than demand");
  assert.equal(rows[0].whyItMatters, "us_gas_supply engine reason", "falls back to the engine's own reason when no AI row exists");
  assert.equal(rows[0].announced, null);
  assert.equal(rows[0].possible, null);
});

test("buildRiskTable uses the AI's explanation text but keeps the engine's level", () => {
  const payload = { ...SAMPLE_WEEKLY_REPORT_PAYLOAD, modules: { deterministic_risk_opportunity: [riskItem("us_gas_supply", "MODERATE_RISK", 1), riskItem("storage_levels", "WATCH", 2)] } };
  const rows = buildRiskTable(payload, { ...SAMPLE_WEEKLY_ANALYST_ASSESSMENT, riskTable: [{ evidenceId: RISK_A, whyItMatters: "AI why.", announcedAction: "Hedged.", announcedActionEvidenceIds: [HEDGING], possibleResponse: "Could consider more." }] }, 5);
  assert.equal(rows.length, 1, "only rows the AI explained are listed when it supplied a table");
  assert.deepEqual(rows[0], { risk: "U.S. gas supply growing faster than demand", level: "Medium", whyItMatters: "AI why.", announced: "Hedged.", possible: "Could consider more." });
});

function metric(id, points) {
  return { id, status: "ok", freshness: "current", value: points[0].value, period: points[0].period, history: points };
}

test("buildMacroChartSeries: oldest-first Henry Hub, and each storage week's 5-yr average equals buildStorageComparison for that week", () => {
  const storageHistory = [];
  for (let i = 0; i < 320; i += 1) {
    const date = new Date(Date.UTC(2026, 9, 2) - i * 7 * 864e5).toISOString().slice(0, 10);
    storageHistory.push({ period: date, value: 2000 + ((i * 37) % 900) });
  }
  const series = buildMacroChartSeries(metric("henry_hub", [{ period: "2026-10-06", value: 3.03 }, { period: "2026-10-05", value: 2.9 }]), metric("storage", storageHistory));
  assert.deepEqual(series.henryHubDaily.points, [{ period: "2026-10-05", value: 2.9 }, { period: "2026-10-06", value: 3.03 }]);
  assert.equal(series.storageWeekly.points.length, 26);
  assert.equal(series.storageWeekly.points.at(-1).period, "2026-10-02");
  series.storageWeekly.points.forEach((point, k) => {
    const i = 25 - k;
    assert.equal(point.fiveYearAverage, buildStorageComparison(storageHistory.slice(i)).fiveYearAverage);
  });
});

test("buildMacroChartSeries omits a series for a stale or failed metric rather than charting it", () => {
  const stale = { ...metric("henry_hub", [{ period: "2026-01-01", value: 3 }, { period: "2025-12-31", value: 3 }]), freshness: "stale" };
  assert.deepEqual(buildMacroChartSeries(stale, undefined), {});
});

test("Range FCF chart series is real reported quarters only, oldest first", () => {
  const { chartSeries } = collectRangeCompanyEvidence(new Date("2026-10-13T00:00:00Z"));
  const points = chartSeries.rangeFcfQuarterly.points;
  assert.ok(points.length >= 2 && points.length <= 10);
  assert.ok(points.every((p) => typeof p.value === "number" && /^Q[1-4] \d{4}$/.test(p.period)));
});

test("point-estimate guidance displays management's wording instead of '-----'", () => {
  const { items } = collectRangeCompanyEvidence(new Date("2026-10-13T00:00:00Z"));
  const guidance = items.filter((item) => item.metricKey.startsWith("guidance:"));
  assert.ok(guidance.length > 0);
  for (const item of guidance) assert.doesNotMatch(item.displayValue, /^-{3,}/, `${item.evidenceId} still renders a dash placeholder`);
});

test("snapshots frozen before chartSeries existed render without trend charts, and say so", () => {
  assert.equal(SAMPLE_WEEKLY_REPORT_PAYLOAD.chartSeries, undefined);
  assert.deepEqual(buildMarketCharts(SAMPLE_WEEKLY_REPORT_PAYLOAD), []);
  assert.equal(buildRangeFcfChart(SAMPLE_WEEKLY_REPORT_PAYLOAD), null);
  assert.ok(buildChartGaps(SAMPLE_WEEKLY_REPORT_PAYLOAD).some((gap) => /frozen before chart history/.test(gap)));
  assert.ok(buildChartGaps(SAMPLE_WEEKLY_REPORT_PAYLOAD).some((gap) => /Appalachian gas prices vs\. Henry Hub: not charted/.test(gap)));
});

test("KPI tiles read their values and changes straight from evidence comparisons", () => {
  const tiles = buildKpiTiles(SAMPLE_WEEKLY_REPORT_PAYLOAD);
  const hh = tiles.find((t) => t.label === "Henry Hub Gas Price");
  assert.equal(hh.value, "$3.42/MMBtu");
  assert.equal(hh.change, "Up 6.5% from a week earlier");
});

test("storage chart draws the 5-year average as a gap (not a bridged line) where it is unavailable", () => {
  const svg = renderLineChartSvg({
    id: "c",
    title: "t",
    valueFormat: "bcf",
    caption: "",
    sourceLine: "",
    series: [
      { label: "Storage", style: "primary", points: [{ x: "2026-09-11", y: 3300 }, { x: "2026-09-18", y: 3350 }, { x: "2026-09-25", y: 3415 }] },
      { label: "5-year average", style: "reference", points: [{ x: "2026-09-11", y: 3290 }, { x: "2026-09-18", y: null }, { x: "2026-09-25", y: 3400 }] }
    ]
  });
  const referencePath = svg.match(/<path d="([^"]+)"[^>]*stroke-dasharray/)[1];
  assert.equal((referencePath.match(/M/g) || []).length, 2, "a null point must break the line into two segments");
});

test("peer panels highlight RRC and draw a negative value left of a zero line", () => {
  const svg = renderPeerPanelSvg({ id: "p", title: "FCF yield", hint: "", bars: [{ label: "EXE", value: 12.4, displayValue: "12.4%", isRange: false }, { label: "RRC", value: 8.8, displayValue: "8.8%", isRange: true }, { label: "CRK", value: -12, displayValue: "-12.0%", isRange: false }] });
  assert.match(svg, /font-weight="700"[^>]*>RRC</);
  assert.match(svg, /<line x1=/, "a zero line is drawn when any value is negative");
});

test("peer panels only compare values from the same period as Range's", () => {
  const { panels } = buildPeerPanels(SAMPLE_WEEKLY_REPORT_PAYLOAD);
  for (const panel of panels) assert.equal(panel.bars.filter((b) => b.isRange).length, 1);
});

test("rendered report has the 4-column risk table and keeps announced vs. possible actions visually distinct", () => {
  const assessment = { ...SAMPLE_WEEKLY_ANALYST_ASSESSMENT, whatChanged: SAMPLE_WEEKLY_ANALYST_ASSESSMENT.whatChanged.map((w, i) => ({ ...w, impact: i === 0 ? "positive" : "negative" })) };
  const payload = { ...SAMPLE_WEEKLY_REPORT_PAYLOAD, modules: { ...SAMPLE_WEEKLY_REPORT_PAYLOAD.modules, deterministic_risk_opportunity: [riskItem("us_gas_supply", "MODERATE_RISK", 1)] } };
  const html = renderReportHtml(buildWeeklyReportRenderModel(payload, { ...assessment, riskTable: [{ evidenceId: RISK_A, whyItMatters: "Why.", announcedAction: "Hedged.", announcedActionEvidenceIds: [HEDGING], possibleResponse: "Could consider more hedges." }] }), null);
  assert.match(html, /<th[^>]*>Risk<\/th><th[^>]*>Risk Level<\/th><th[^>]*>Why This Matters<\/th><th[^>]*>What Range Can Do<\/th>/);
  assert.match(html, /class="level level-medium">Medium</);
  assert.match(html, /action-announced">Announced<\/span>Hedged\./);
  assert.match(html, /action-possible">Possible option<\/span>Could consider more hedges\./);
  assert.match(html, /Helps Range/);
  assert.match(html, /Hurts Range/);
});

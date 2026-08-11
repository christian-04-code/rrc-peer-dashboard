const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const {
  MAX_SELECTED_COMPANIES,
  focusSelectedCompany,
  updateCompanyComparison
} = load("lib/dashboard/company-comparison.ts");
const {
  getSelectedChartGuidance,
  getVisibleChartGuidance
} = load("lib/dashboard/chart-guidance.ts");

const homeSource = fs.readFileSync(path.join(process.cwd(), "components", "HomeDashboard.tsx"), "utf8");
const selectorSource = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "CompanyComparisonSelector.tsx"), "utf8");
const chartSource = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "ChartWorkspace.tsx"), "utf8");

test("Overview uses one unified multi-select company row without primary/peer labels", () => {
  assert.match(homeSource, /aria-label="Company comparison selection"/);
  assert.match(homeSource, /selectedTickers=\{selectedTickers\}/);
  assert.doesNotMatch(homeSource, /<CompanySelector/);
  assert.doesNotMatch(`${homeSource}\n${selectorSource}`, /Primary company|Compare peers/);
  assert.match(selectorSource, /Compare companies/);
  assert.match(selectorSource, /aria-pressed=\{selected\}/);
});

test("company selection supports all seven companies and always retains one", () => {
  assert.equal(MAX_SELECTED_COMPANIES, 7);
  const onlyRrc = { selectedTickers: ["RRC"], focusedTicker: "RRC" };
  assert.deepEqual(updateCompanyComparison(onlyRrc, "RRC"), onlyRrc);

  let state = onlyRrc;
  for (const ticker of ["AR", "CNX", "CRK", "EQT", "EXE", "GPOR"]) {
    state = updateCompanyComparison(state, ticker);
  }
  assert.deepEqual(state.selectedTickers, ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"]);
  assert.equal(state.focusedTicker, "GPOR");
});

test("focused-company details can change without changing the comparison set", () => {
  const state = { selectedTickers: ["RRC", "AR"], focusedTicker: "AR" };
  const focused = focusSelectedCompany(state, "RRC");
  assert.deepEqual(focused.selectedTickers, state.selectedTickers);
  assert.equal(focused.focusedTicker, "RRC");

  const removed = updateCompanyComparison(focused, "RRC");
  assert.deepEqual(removed, { selectedTickers: ["AR"], focusedTicker: "AR" });
  assert.match(selectorSource, /aria-label="Focused company details"/);
});

test("multi-company production guidance includes both RRC and AR without contamination", () => {
  const result = getSelectedChartGuidance(["RRC", "AR"], "production");
  assert.equal(result.status, "provided");
  assert.deepEqual(new Set(result.points.map((point) => point.ticker)), new Set(["RRC", "AR"]));
  assert.ok(result.points.every((point) => point.metric === "production"));
  assert.ok(result.points.some((point) => point.ticker === "AR" && point.kind === "range" && point.low === 4.15 && point.high === 4.2));
});

test("selected companies without compatible guidance receive no fabricated overlays", () => {
  const mixed = getSelectedChartGuidance(["CNX", "EQT"], "fcf");
  assert.ok(mixed.points.length > 0);
  assert.ok(mixed.points.every((point) => point.ticker === "CNX"));

  const none = getSelectedChartGuidance(["RRC", "EQT"], "revenue");
  assert.equal(none.status, "not_provided");
  assert.deepEqual(none.points, []);
});

test("one global toggle controls all selected-company guidance only", () => {
  const guidance = getSelectedChartGuidance(["RRC", "AR"], "production");
  assert.deepEqual(getVisibleChartGuidance(guidance, false), []);
  assert.deepEqual(getVisibleChartGuidance(guidance, true), guidance.points);
  assert.match(chartSource, /aria-pressed=\{showManagementGuidance\}/);
  assert.match(chartSource, /guidance\.status === "provided"/);
  assert.equal((chartSource.match(/Management Guidance — dashed/g) ?? []).length, 1);
});

test("chart guidance uses each point's ticker for color, identity, and collision-safe keys", () => {
  assert.match(chartSource, /getCompanyColor\(point\.ticker\)/);
  assert.match(chartSource, /`\$\{point\.ticker\} Management Guidance/);
  assert.match(chartSource, /guidance-\$\{point\.ticker\}/);
  assert.match(chartSource, /guidanceMarkOffset\(point, visibleGuidance\)/);
  assert.match(chartSource, /`\$\{point\.ticker\} · Management Guidance`/);
  assert.match(chartSource, /Low:/);
  assert.match(chartSource, /High:/);
});

test("chart rendering is driven by selectedTickers without a privileged first series", () => {
  assert.match(chartSource, /selectedTickers\.map/);
  assert.match(chartSource, /selectedTickers\.flatMap/);
  assert.match(chartSource, /getSelectedChartGuidance\(selectedTickers, metric\)/);
  assert.doesNotMatch(chartSource, /comparisonTickers|primary-legend|seriesIndex === 0/);
  assert.match(chartSource, /Internal Model Forecast/);
  assert.match(chartSource, /Actual/);
});

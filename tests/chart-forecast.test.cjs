const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const {
  buildForecastChartSeries,
  isForecastChartSupported,
  FORECAST_CHART_PERIODS,
  forecastQuarterLabel
} = load("lib/dashboard/chart-forecast.ts");

const { getAllQuartersForTicker } = load("lib/dashboard/financials-quarterly.ts");

test("only RRC is marked as forecast-engine supported; peers are not", () => {
  assert.equal(isForecastChartSupported("RRC"), true);
  for (const ticker of ["AR", "CNX", "CRK", "EQT", "EXE", "GPOR"]) {
    assert.equal(isForecastChartSupported(ticker), false);
  }
});

test("forecast chart periods start after the latest reported actual quarter (2026Q1) and never re-derive it", () => {
  assert.ok(!FORECAST_CHART_PERIODS.includes("2026Q1"));
  assert.equal(FORECAST_CHART_PERIODS[0], "2026Q2");
  assert.equal(FORECAST_CHART_PERIODS[FORECAST_CHART_PERIODS.length - 1], "2028Q4");
  assert.equal(FORECAST_CHART_PERIODS.length, 11);
});

test("forecastQuarterLabel matches the axis label style used for reported quarters", () => {
  assert.equal(forecastQuarterLabel("2026Q2"), "Q2 2026");
  assert.equal(forecastQuarterLabel("2028Q4"), "Q4 2028");
});

test("RRC revenue and EBITDAX forecast series resolve real modeled numbers for every forecast period", () => {
  const revenue = buildForecastChartSeries("RRC", "revenue");
  const ebitdax = buildForecastChartSeries("RRC", "ebitdax");
  assert.equal(revenue.length, FORECAST_CHART_PERIODS.length);
  assert.equal(ebitdax.length, FORECAST_CHART_PERIODS.length);
  for (const point of revenue) {
    assert.ok(typeof point.value === "number" && Number.isFinite(point.value), `revenue ${point.period} should be numeric`);
  }
  for (const point of ebitdax) {
    assert.ok(typeof point.value === "number" && Number.isFinite(point.value), `ebitdax ${point.period} should be numeric`);
  }
});

test("revenue and ebitdax select genuinely different metric series (not the same underlying number)", () => {
  const revenue = buildForecastChartSeries("RRC", "revenue");
  const ebitdax = buildForecastChartSeries("RRC", "ebitdax");
  assert.notEqual(revenue[0].value, ebitdax[0].value);
});

test("a current market price input changes the modeled revenue series (live commodity inputs actually flow through)", () => {
  const baseline = buildForecastChartSeries("RRC", "revenue");
  const withLivePrice = buildForecastChartSeries("RRC", "revenue", {
    henryHubPerMmbtu: { value: 12, unit: "$/MMBtu", source: { name: "test", reference: "test", period: "current", retrievedAt: new Date().toISOString(), classification: "live" } }
  });
  assert.notEqual(baseline[0].value, withLivePrice[0].value);
});

test("peer tickers unsupported by the forecast engine return an empty forecast series, never a fabricated one", () => {
  for (const ticker of ["AR", "CNX", "CRK", "EQT", "EXE", "GPOR"]) {
    assert.deepEqual(buildForecastChartSeries(ticker, "revenue"), []);
    assert.deepEqual(buildForecastChartSeries(ticker, "ebitdax"), []);
  }
});

test("historical actual quarters (financials-quarterly.ts) are untouched by the forecast series -- Q1 2026 stays the reported actual", () => {
  const reportedQ1_2026 = getAllQuartersForTicker("RRC").find((row) => row.quarter === "Q1 2026");
  assert.equal(reportedQ1_2026.revenue.source, "codex");
  assert.equal(reportedQ1_2026.revenue.basis, "actual");
  // The forecast series intentionally excludes 2026Q1 so it can never overwrite this actual.
  const forecastPeriods = buildForecastChartSeries("RRC", "revenue").map((point) => point.period);
  assert.ok(!forecastPeriods.includes("Q1 2026"));
});

test("ChartWorkspace renders modeled forecast periods with the dashed forecast-line class, distinct from reported actuals", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "ChartWorkspace.tsx"), "utf8");
  assert.match(source, /forecast-line/);
  assert.match(source, /buildForecastChartSeries/);
  assert.match(source, /"revenue"/);
  assert.match(source, /"ebitdax"/);
  assert.doesNotMatch(source, /"valuation"/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const { buildForecastChartSeries, FORECAST_CHART_PERIODS } = load("lib/dashboard/chart-forecast.ts");
const { freeCashFlowQuarterly, getQuarterlyFreeCashFlow } = load("lib/dashboard/free-cash-flow-quarterly.ts");
const { quarters } = load("lib/dashboard/financials-quarterly.ts");

test("ChartWorkspace's fcf metric reads the real normalized dataset instead of a hardcoded null/unsupported stub", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "ChartWorkspace.tsx"), "utf8");
  assert.match(source, /getQuarterlyFreeCashFlow\(row\.ticker, row\.quarter\)\.value/);
  const fcfBlock = source.slice(source.indexOf("fcf: {"), source.indexOf("fcf: {") + 200);
  assert.doesNotMatch(fcfBlock, /value: \(\) => null/);
  assert.match(fcfBlock, /comparable: true/);
});

test("historical FCF is present for every core peer across all nine reported quarters, including negative values", () => {
  const tickers = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];
  let sawNegative = false;
  for (const ticker of tickers) {
    for (const quarter of quarters) {
      const point = getQuarterlyFreeCashFlow(ticker, quarter);
      assert.equal(typeof point.value, "number", `${ticker} ${quarter} should have a numeric FCF value`);
      assert.ok(Number.isFinite(point.value));
      if (point.value < 0) sawNegative = true;
    }
  }
  assert.ok(sawNegative, "at least one historical quarter (e.g. CRK) should be negative and render correctly, not get dropped");
});

test("RRC Q2 2026 FCF preserves the site's approved nearest-$MM rounding", () => {
  const q2 = getQuarterlyFreeCashFlow("RRC", "Q2 2026");
  assert.equal(q2.value, 111);
  assert.notEqual(q2.value, 110.510);
  assert.match(q2.note, /\$110\.510MM/);
  assert.match(q2.note, /stored as \$111MM/);
});

test("RRC modeled quarterly FCF is available directly from the deterministic engine (no annual-to-quarterly allocation)", () => {
  const fcf = buildForecastChartSeries("RRC", "fcf");
  assert.equal(fcf.length, FORECAST_CHART_PERIODS.length);
  for (const point of fcf) {
    assert.ok(typeof point.value === "number" && Number.isFinite(point.value), `fcf ${point.period} should be a real modeled quarterly number`);
  }
});

test("peer tickers get no fabricated modeled FCF -- forecast engine only supports RRC", () => {
  for (const ticker of ["AR", "CNX", "CRK", "EQT", "EXE", "GPOR"]) {
    assert.deepEqual(buildForecastChartSeries(ticker, "fcf"), []);
  }
});

test("modeled fcf is a genuinely different series from modeled ebitdax (reuses the engine's own freeCashFlowMillion field, not a duplicate formula)", () => {
  const fcf = buildForecastChartSeries("RRC", "fcf");
  const ebitdax = buildForecastChartSeries("RRC", "ebitdax");
  assert.notEqual(fcf[0].value, ebitdax[0].value);
});

test("freeCashFlowQuarterly source data itself is untouched/unblended (still $MM, still per-ticker source-tagged)", () => {
  for (const ticker of Object.keys(freeCashFlowQuarterly)) {
    for (const quarter of quarters) {
      const point = freeCashFlowQuarterly[ticker][quarter];
      assert.ok(point.source === "codex" || point.source === "factset");
    }
  }
});

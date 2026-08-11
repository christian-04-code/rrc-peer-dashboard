const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const {
  getChartGuidance,
  getManagementGuidanceAuditMatrix,
  getManagementGuidanceAuditMeta,
  getVisibleChartGuidance
} = load("lib/dashboard/chart-guidance.ts");

const TICKERS = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];
const METRICS = ["production", "revenue", "fcf", "capex", "debt", "ebitdax"];
const VALID_AUDIT_STATUSES = new Set(["explicit_guidance", "long_term_target", "not_guided"]);

test("the final dataset has 228 records with 216 current Q2-cycle and 12 preserved Q1 records", () => {
  const raw = require(path.join(process.cwd(), "data", "management-guidance.json"));
  const records = Object.values(raw.companies).flatMap((company) => company.entries);
  assert.equal(records.length, 228);
  assert.equal(records.filter((record) => record.reportingCycle === "Q2 2026").length, 216);
  assert.equal(records.filter((record) => record.reportingCycle === "Q1 2026").length, 12);
  assert.equal(getManagementGuidanceAuditMeta().reportingCycle, "Q2 2026");
});

test("the audit matrix covers every supported company and forecast metric", () => {
  const matrix = getManagementGuidanceAuditMatrix();
  assert.deepEqual(Object.keys(matrix), TICKERS);
  for (const ticker of TICKERS) {
    assert.deepEqual(Object.keys(matrix[ticker]), METRICS);
    for (const metric of METRICS) assert.ok(VALID_AUDIT_STATUSES.has(matrix[ticker][metric]));
  }
});

test("all chart overlays come only from the current Q2 reporting cycle", () => {
  for (const ticker of TICKERS) {
    for (const metric of METRICS) {
      for (const point of getChartGuidance(ticker, metric).points) {
        assert.equal(point.reportingCycle, "Q2 2026");
      }
    }
  }
});

test("RRC keeps FY guidance, the 2027 target, and new Q3 guidance distinct", () => {
  const guidance = getChartGuidance("RRC", "production");
  assert.deepEqual(guidance.points.map((point) => [point.period, point.plotPeriod, point.guidanceType]), [
    ["FY 2026", "Q4 2026", "range"],
    ["FY 2027", "Q4 2027", "long_term_target"],
    ["Q3 2026", "Q3 2026", "approximate_point_estimate"]
  ]);
  assert.equal(guidance.points[0].chartLow, 2350);
  assert.equal(guidance.points[1].chartValue, 2600);
  assert.equal(guidance.points[2].chartValue, 2400);
});

test("current ranges preserve low, midpoint, high, unit, type, source, and status", () => {
  const target = getChartGuidance("AR", "production").points.find((point) => point.period === "FY 2026");
  assert.equal(target.kind, "range");
  assert.equal(target.low, 4.15);
  assert.equal(target.midpoint, 4.175);
  assert.equal(target.high, 4.2);
  assert.equal(target.unit, "Bcfe/d");
  assert.equal(target.status, "raised");
  assert.match(target.source, /Antero Resources Corp Q2 2026 Earnings/);
});

test("annual financial guidance appears once and is never divided into quarters", () => {
  for (const ticker of TICKERS) {
    for (const metric of ["revenue", "fcf", "capex", "debt", "ebitdax"]) {
      const points = getChartGuidance(ticker, metric).points;
      for (const point of points.filter((candidate) => candidate.period.startsWith("FY "))) {
        assert.match(point.plotPeriod, /^Q4 /);
      }
      assert.equal(new Set(points.map((point) => `${point.period}:${point.plotPeriod}`)).size, points.length);
    }
  }
});

test("incompatible units, non-total components, and thresholds stay off the chart", () => {
  assert.equal(getChartGuidance("CNX", "production").status, "not_provided");
  assert.equal(getChartGuidance("EQT", "production").status, "not_provided");
  assert.equal(getChartGuidance("GPOR", "fcf").status, "not_provided");
  assert.equal(getChartGuidance("AR", "capex").status, "not_provided", "AR components must not become an inferred total");
  assert.equal(getChartGuidance("GPOR", "capex").status, "not_provided", "GPOR acreage must not merge into base CapEx");
  assert.equal(getChartGuidance("RRC", "fcf").status, "not_provided", "cumulative >$1.7B is not quarterly FCF");
});

test("EXE Q2 range supersedes the Q1 point and normalizes its disclosed midpoint consistently", () => {
  const points = getChartGuidance("EXE", "production").points;
  assert.equal(points.length, 1);
  assert.equal(points[0].kind, "range");
  assert.equal(points[0].low, 7400);
  assert.equal(points[0].midpoint, 7500);
  assert.equal(points[0].high, 7600);
});

test("CRK current FY26 CapEx is the updated $1,450-$1,550MM range", () => {
  const points = getChartGuidance("CRK", "capex").points;
  const current = points.find((point) => point.period === "FY 2026");
  assert.equal(current.low, 1450);
  assert.equal(current.midpoint, 1500);
  assert.equal(current.high, 1550);
  assert.equal(current.status, "updated");
  assert.ok(!points.some((point) => point.low === 1400 && point.high === 1500));
});

test("every company and metric returns only its own explicitly stored guidance", () => {
  for (const ticker of TICKERS) {
    for (const metric of METRICS) {
      const guidance = getChartGuidance(ticker, metric);
      for (const point of guidance.points) {
        assert.equal(point.ticker, ticker);
        assert.equal(point.metric, metric);
      }
    }
  }
});

test("the management guidance toggle changes only overlay visibility", () => {
  const guidance = getChartGuidance("RRC", "production");
  assert.deepEqual(getVisibleChartGuidance(guidance, false), []);
  assert.deepEqual(getVisibleChartGuidance(guidance, true), guidance.points);

  const source = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "ChartWorkspace.tsx"), "utf8");
  assert.match(source, /aria-pressed=\{showManagementGuidance\}/);
  assert.match(source, /guidance\.status === "provided"/);
  assert.match(source, /actualPaths\.map/);
  assert.match(source, /modeledPaths\.map/);
  assert.match(source, /management-guidance-line/);
});

test("removed explanatory copy remains absent and current tooltips preserve status and official source", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "ChartWorkspace.tsx"), "utf8");
  assert.doesNotMatch(source, /Reported actuals are shown through the latest reported quarter/);
  assert.doesNotMatch(source, /Capital expenditure definitions vary by company/);
  assert.match(source, /Status:/);
  assert.match(source, /sourceLocation \?\? point\.source/);
  assert.match(source, /Low:/);
  assert.match(source, /High:/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const {
  getChartGuidance,
  getManagementGuidanceAuditMatrix,
  getVisibleChartGuidance
} = load("lib/dashboard/chart-guidance.ts");

const TICKERS = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];
const METRICS = ["production", "revenue", "fcf", "capex", "debt", "ebitdax"];
const VALID_AUDIT_STATUSES = new Set(["explicit_guidance", "long_term_target", "not_guided"]);

test("the audit matrix covers every supported company and forecast metric", () => {
  const matrix = getManagementGuidanceAuditMatrix();
  assert.deepEqual(Object.keys(matrix), TICKERS);
  for (const ticker of TICKERS) {
    assert.deepEqual(Object.keys(matrix[ticker]), METRICS);
    for (const metric of METRICS) assert.ok(VALID_AUDIT_STATUSES.has(matrix[ticker][metric]));
  }
});

test("RRC uses verified annual production guidance and keeps the 2027 target distinct", () => {
  const guidance = getChartGuidance("RRC", "production");
  assert.equal(guidance.status, "provided");
  assert.deepEqual(guidance.points.map((point) => [point.period, point.plotPeriod, point.guidanceType]), [
    ["FY 2026", "Q4 2026", "range"],
    ["FY 2027", "Q4 2027", "long_term_target"]
  ]);
  assert.equal(guidance.points[0].low, 2.35);
  assert.equal(guidance.points[0].midpoint, 2.375);
  assert.equal(guidance.points[0].high, 2.4);
  assert.equal(guidance.points[0].chartLow, 2350);
  assert.equal(guidance.points[1].chartValue, 2600);
});

test("ranges retain original low, midpoint, high, unit, type, and source metadata", () => {
  const target = getChartGuidance("AR", "production").points.find((point) => point.period === "FY 2027");
  assert.equal(target.kind, "range");
  assert.equal(target.low, 4.3);
  assert.equal(target.midpoint, null);
  assert.equal(target.high, 4.5);
  assert.equal(target.unit, "Bcfe/d");
  assert.equal(target.guidanceType, "conditional_target");
  assert.match(target.sourceUrl, /^https:\/\//);
  assert.match(target.sourceDate, /^2026-/);
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

test("incompatible annual-volume and relative-growth disclosures stay in the audit but off the chart", () => {
  assert.equal(getManagementGuidanceAuditMatrix().CNX.production, "explicit_guidance");
  assert.equal(getChartGuidance("CNX", "production").status, "not_provided");
  assert.equal(getManagementGuidanceAuditMatrix().GPOR.fcf, "explicit_guidance");
  assert.equal(getChartGuidance("GPOR", "fcf").status, "not_provided");
  assert.equal(getManagementGuidanceAuditMatrix().EQT.capex, "explicit_guidance");
  assert.equal(getChartGuidance("EQT", "capex").status, "not_provided");
});

test("every company and metric returns only its own explicitly stored guidance", () => {
  for (const ticker of TICKERS) {
    for (const metric of METRICS) {
      const guidance = getChartGuidance(ticker, metric);
      for (const point of guidance.points) {
        assert.equal(point.ticker, ticker);
        assert.equal(point.metric, metric);
      }
      if (getManagementGuidanceAuditMatrix()[ticker][metric] === "not_guided") {
        assert.deepEqual(guidance.points, []);
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
  assert.match(source, /Management Guidance/);
  assert.match(source, /Only explicitly disclosed periods are shown/);
  assert.match(source, /guidance\.status === "provided"/);
  assert.match(source, /actualPaths\.map/);
  assert.match(source, /modeledPaths\.map/);
});

test("the removed explanatory sentence is absent and guidance tooltips are explicit", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "ChartWorkspace.tsx"), "utf8");
  assert.doesNotMatch(source, /Reported actuals are shown through the latest reported quarter/);
  assert.doesNotMatch(source, /Dashed overlays represent management guidance/);
  assert.match(source, /Low:/);
  assert.match(source, /Midpoint:/);
  assert.match(source, /High:/);
  assert.match(source, /Long-term target/);
});

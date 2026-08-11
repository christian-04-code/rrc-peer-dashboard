const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const { getChartGuidance, getVisibleChartGuidance } = load("lib/dashboard/chart-guidance.ts");

test("RRC production guidance appears only at explicitly disclosed periods", () => {
  const guidance = getChartGuidance("RRC", "production");
  assert.equal(guidance.status, "partial");
  assert.deepEqual(guidance.points.map((point) => point.period), ["Q2 2026", "Q4 2026", "Q4 2027"]);
  assert.deepEqual(guidance.points.map((point) => point.value), [2300, 2500, 2600]);
});

test("the management guidance toggle hides only the guidance overlay data", () => {
  const guidance = getChartGuidance("RRC", "production");
  assert.deepEqual(getVisibleChartGuidance(guidance, false), []);
  assert.deepEqual(getVisibleChartGuidance(guidance, true), guidance.points);

  const source = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "ChartWorkspace.tsx"), "utf8");
  assert.match(source, /showManagementGuidance/);
  assert.match(source, /getVisibleChartGuidance\(guidance, showManagementGuidance\)/);
  assert.match(source, /actualPaths\.map/);
  assert.match(source, /modeledPaths\.map/);
});

test("a metric without safely supported guidance returns no dashed series", () => {
  assert.deepEqual(getChartGuidance("RRC", "revenue"), { status: "not_provided", points: [] });
  assert.deepEqual(getChartGuidance("CNX", "production"), { status: "not_provided", points: [] });
});

test("a target endpoint does not create intermediate quarters", () => {
  const periods = getChartGuidance("RRC", "production").points.map((point) => point.period);
  assert.ok(periods.includes("Q4 2027"));
  assert.ok(!periods.includes("Q1 2027"));
  assert.ok(!periods.includes("Q2 2027"));
  assert.ok(!periods.includes("Q3 2027"));
});

test("range guidance remains a low/high range rather than becoming a midpoint", () => {
  const target = getChartGuidance("AR", "production").points.find((point) => point.period === "Q4 2027");
  assert.deepEqual(target, {
    kind: "range",
    period: "Q4 2027",
    low: 4300,
    high: 4500,
    disclosure: "2027 Production Target: ~4.3–4.5 Bcfe/d",
    target: true
  });
  assert.equal("value" in target, false);
});


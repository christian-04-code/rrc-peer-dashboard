const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const {
  compareStorageWeekly,
  compareDailyWeekly,
  compareMonthlySeries,
  compareQuarterly,
  compareRigDelta,
  compareSteoVintage
} = load("lib/reports/comparisons.ts");

function weekly(periods) {
  return periods.map(([period, value]) => ({ period, value }));
}

test("compareStorageWeekly: WoW/YoY/vs5yrAvg all unavailable on an empty history, never fabricated", () => {
  const results = compareStorageWeekly([], "storage", "Storage");
  assert.equal(results.length, 3);
  for (const result of results) {
    assert.equal(result.direction, "unavailable");
    assert.equal(result.currentValue, null);
    assert.equal(result.previousValue, null);
  }
});

test("compareStorageWeekly: WoW reflects the immediately preceding week only", () => {
  const history = weekly([["2026-08-28", 3000], ["2026-08-21", 2900], ["2026-08-14", 2800]]);
  const results = compareStorageWeekly(history, "storage", "Storage");
  const wow = results.find((r) => r.period === "WoW");
  assert.equal(wow.currentValue, 3000);
  assert.equal(wow.previousValue, 2900);
  assert.equal(wow.delta, 100);
  assert.equal(wow.direction, "up");
});

test("compareStorageWeekly: vs5yrAvg is unavailable without 5 complete distinct prior years at the same ISO week", () => {
  const history = weekly([["2026-08-28", 3000], ["2025-08-29", 2950]]);
  const results = compareStorageWeekly(history, "storage", "Storage");
  const vs5yr = results.find((r) => r.period === "vs5yrAvg");
  assert.equal(vs5yr.direction, "unavailable");
});

test("compareDailyWeekly: finds the observation 7 calendar days earlier within tolerance, not a fixed row-index", () => {
  const history = weekly([
    ["2026-08-28", 3.5], // Friday
    ["2026-08-27", 3.4],
    ["2026-08-26", 3.3],
    ["2026-08-25", 3.2],
    // weekend gap -- no 2026-08-23/24 rows
    ["2026-08-21", 3.1] // exactly 7 days before 2026-08-28
  ]);
  const [wow] = compareDailyWeekly(history, "henry_hub", "Henry Hub");
  assert.equal(wow.currentValue, 3.5);
  assert.equal(wow.previousValue, 3.1);
});

test("compareDailyWeekly: unavailable when nothing falls near 7 days back", () => {
  const history = weekly([["2026-08-28", 3.5], ["2026-08-01", 3.0]]);
  const [wow] = compareDailyWeekly(history, "henry_hub", "Henry Hub");
  assert.equal(wow.direction, "unavailable");
});

test("compareMonthlySeries: MoM and YoY only -- never WoW/vs5yrAvg for a monthly series", () => {
  const history = [
    { period: "2026-07", value: 3_400_000 },
    { period: "2026-06", value: 3_350_000 },
    { period: "2025-07", value: 3_200_000 }
  ];
  const results = compareMonthlySeries(history, "production", "Production");
  assert.deepEqual(results.map((r) => r.period).sort(), ["MoM", "YoY"]);
  const mom = results.find((r) => r.period === "MoM");
  assert.equal(mom.previousValue, 3_350_000);
  const yoy = results.find((r) => r.period === "YoY");
  assert.equal(yoy.previousValue, 3_200_000);
});

test("compareMonthlySeries: does not fabricate a MoM/YoY comparison when the calendar-exact prior month/year is missing from history", () => {
  const history = [{ period: "2026-07", value: 3_400_000 }, { period: "2026-01", value: 3_000_000 }];
  const results = compareMonthlySeries(history, "production", "Production");
  const mom = results.find((r) => r.period === "MoM");
  assert.equal(mom.direction, "unavailable", "2026-06 does not exist in history -- must not fall back to the nearest available point");
});

test("compareMonthlySeries: an unchanged latest observation across repeated calls produces the same (non-fabricated, non-drifting) comparison every time -- no fake 'weekly' movement is invented for a monthly series", () => {
  const history = [{ period: "2026-07", value: 3_400_000 }, { period: "2026-06", value: 3_400_000 }];
  const first = compareMonthlySeries(history, "production", "Production");
  const second = compareMonthlySeries(history, "production", "Production");
  assert.deepEqual(first, second);
  const mom = first.find((r) => r.period === "MoM");
  assert.equal(mom.delta, 0);
  assert.equal(mom.direction, "flat");
});

test("compareQuarterly: QoQ and priorQuarterActuals (YoY) via the fixed quarters array", () => {
  const values = { "Q1 2026": { value: 100 }, "Q2 2026": { value: 110 }, "Q2 2025": { value: 90 } };
  const getValue = (quarter) => values[quarter];
  const results = compareQuarterly("revenue", "Revenue", "Q2 2026", getValue);
  const qoq = results.find((r) => r.period === "QoQ");
  assert.equal(qoq.currentValue, 110);
  assert.equal(qoq.previousValue, 100);
  const yoy = results.find((r) => r.period === "priorQuarterActuals");
  assert.equal(yoy.previousValue, 90);
});

test("compareQuarterly: unavailable, not zero, when a quarter's value is genuinely missing", () => {
  const getValue = () => ({ value: null });
  const results = compareQuarterly("revenue", "Revenue", "Q2 2026", getValue);
  for (const result of results) {
    assert.equal(result.direction, "unavailable");
  }
});

test("compareQuarterly: no QoQ/YoY fabricated for the very first quarter in the series (no prior quarter exists)", () => {
  const values = { "Q1 2024": { value: 50 } };
  const getValue = (quarter) => values[quarter];
  const results = compareQuarterly("revenue", "Revenue", "Q1 2024", getValue);
  for (const result of results) {
    assert.equal(result.direction, "unavailable");
  }
});

test("compareRigDelta: reuses the import pipeline's own precomputed WoW/YoY rather than recomputing", () => {
  const delta = { current: 45, priorWeek: 40, wow: 5, wowPct: 0.125, yearAgo: 30, yoy: 15, yoyPct: 0.5 };
  const results = compareRigDelta(delta, "national_us", "U.S. Rig Count", "2026-08-14");
  const wow = results.find((r) => r.period === "WoW");
  assert.equal(wow.delta, 5);
  assert.ok(Math.abs(wow.deltaPct - 12.5) < 1e-9);
  const yoy = results.find((r) => r.period === "YoY");
  assert.equal(yoy.delta, 15);
  assert.ok(Math.abs(yoy.deltaPct - 50) < 1e-9);
});

test("compareRigDelta: unavailable when the pipeline itself has no prior-week/prior-year value", () => {
  const delta = { current: 45, priorWeek: null, wow: null, wowPct: null, yearAgo: null, yoy: null, yoyPct: null };
  const results = compareRigDelta(delta, "national_us", "U.S. Rig Count", null);
  for (const result of results) assert.equal(result.direction, "unavailable");
});

test("compareSteoVintage: [] when there is no real revision history (fewer than two persisted vintages)", () => {
  assert.deepEqual(compareSteoVintage([], "henryHubForecast", "Henry Hub Forecast"), []);
});

test("compareSteoVintage: one comparison per real revision, never inferred", () => {
  const revisions = [
    { seriesId: "NGHHMCF", label: "Henry Hub", unit: "$/Mcf", period: "2027-01", previousSnapshotMonth: "2026-07", previousValue: 3.2, currentSnapshotMonth: "2026-08", currentValue: 3.5, delta: 0.3, deltaPct: 9.375 }
  ];
  const results = compareSteoVintage(revisions, "henryHubForecast", "Henry Hub Forecast");
  assert.equal(results.length, 1);
  assert.equal(results[0].period, "steoVintage");
  assert.equal(results[0].delta, 0.3);
  assert.equal(results[0].direction, "up");
});

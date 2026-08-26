const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { buildAppalachiaProduction, classifyGasBalance, filterToForecastHorizon, toBcfdSeries } = load("lib/market/macro-analytics.ts");

function stateMetric(history) {
  return {
    stateCode: "X",
    stateName: "X",
    unit: "MMcf/month",
    frequency: "monthly",
    status: "ok",
    period: history[0]?.period ?? null,
    fetchedAt: new Date().toISOString(),
    current: history[0]?.value ?? 0,
    priorMonth: null,
    monthOverMonthPct: null,
    yearAgo: null,
    yearOverYearPct: null,
    history
  };
}

test("buildAppalachiaProduction sums PA + WV + OH for periods all three report", () => {
  const states = {
    PA: stateMetric([{ period: "2026-06", value: 100 }, { period: "2026-05", value: 90 }]),
    WV: stateMetric([{ period: "2026-06", value: 30 }, { period: "2026-05", value: 28 }]),
    OH: stateMetric([{ period: "2026-06", value: 20 }, { period: "2026-05", value: 18 }])
  };
  const result = buildAppalachiaProduction(states);
  assert.deepEqual(result.statesIncluded, ["PA", "WV", "OH"]);
  assert.equal(result.current, 150);
  assert.equal(result.period, "2026-06");
  assert.equal(result.history.length, 2);
});

test("buildAppalachiaProduction excludes a period when any of the three states is missing it -- never treats a non-reporting state as zero", () => {
  const states = {
    PA: stateMetric([{ period: "2026-06", value: 100 }, { period: "2026-05", value: 90 }]),
    WV: stateMetric([{ period: "2026-06", value: 30 }]), // no 2026-05
    OH: stateMetric([{ period: "2026-06", value: 20 }, { period: "2026-05", value: 18 }])
  };
  const result = buildAppalachiaProduction(states);
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].period, "2026-06");
});

test("buildAppalachiaProduction reports only the states actually available, never assuming all three exist", () => {
  const states = { PA: stateMetric([{ period: "2026-06", value: 100 }]) };
  const result = buildAppalachiaProduction(states);
  assert.deepEqual(result.statesIncluded, ["PA"]);
  assert.equal(result.current, 100);
});

test("buildAppalachiaProduction returns an empty, non-crashing result when no Appalachia state is available", () => {
  const result = buildAppalachiaProduction({});
  assert.deepEqual(result, { statesIncluded: [], history: [], current: null, period: null, monthOverMonthPct: null, yearOverYearPct: null });
});

test("buildAppalachiaProduction computes month-over-month and year-over-year percentages from the summed series", () => {
  const history = [
    { period: "2026-06", value: 150 },
    { period: "2026-05", value: 120 },
    { period: "2025-06", value: 100 }
  ];
  const states = {
    PA: stateMetric(history.map((point) => ({ ...point, value: point.value }))),
    WV: stateMetric(history.map((point) => ({ ...point, value: 0 }))),
    OH: stateMetric(history.map((point) => ({ ...point, value: 0 })))
  };
  const result = buildAppalachiaProduction(states);
  assert.equal(result.monthOverMonthPct.toFixed(2), (((150 - 120) / 120) * 100).toFixed(2));
  assert.equal(result.yearOverYearPct.toFixed(2), (((150 - 100) / 100) * 100).toFixed(2));
});

test("classifyGasBalance: Tightening requires storage below normal AND LNG expanding", () => {
  assert.equal(classifyGasBalance(-6, 6).gasState, "Tightening");
  assert.equal(classifyGasBalance(-6, 2).gasState, "Balanced");
});

test("classifyGasBalance: Loosening requires storage above normal AND LNG contracting", () => {
  assert.equal(classifyGasBalance(6, -6).gasState, "Loosening");
  assert.equal(classifyGasBalance(6, 2).gasState, "Balanced");
});

test("classifyGasBalance: Unavailable only when both inputs are unavailable", () => {
  assert.equal(classifyGasBalance(null, null).gasState, "Unavailable");
  assert.equal(classifyGasBalance(null, 6).gasState, "Balanced");
});

test("toBcfdSeries converts MMcf/month to Bcf/d using the exact calendar-day denominator, matching EIA STEO's own unit convention", () => {
  const result = toBcfdSeries([{ period: "2026-02", value: 2_800_000 }]); // 28-day February
  assert.equal(result[0].value.toFixed(3), (2_800_000 / 28 / 1000).toFixed(3));
});

test("toBcfdSeries drops (never fabricates) a point whose period can't be parsed as MMcf/month", () => {
  const result = toBcfdSeries([{ period: "not-a-period", value: 100 }, { period: "2026-06", value: 3_000_000 }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].period, "2026-06");
});

test("toBcfdSeries output is on the same order of magnitude as EIA STEO's Bcf/d forecast series, unlike the raw MMcf/month input", () => {
  const result = toBcfdSeries([{ period: "2026-06", value: 3_400_000 }]); // realistic U.S. dry-gas MMcf/month
  assert.ok(result[0].value > 50 && result[0].value < 200, `expected a Bcf/d-scale value, got ${result[0].value}`);
});

test("filterToForecastHorizon drops EIA STEO's own historical tail, keeping only periods at or after the boundary -- never labels 2009-era data as a forecast", () => {
  const points = [{ period: "2009-07", value: 1 }, { period: "2026-05", value: 2 }, { period: "2026-06", value: 3 }, { period: "2027-12", value: 4 }];
  const result = filterToForecastHorizon(points, "2026-06");
  assert.deepEqual(result.map((point) => point.period), ["2026-06", "2027-12"]);
});

test("filterToForecastHorizon returns the series unfiltered when no boundary is available, rather than dropping everything", () => {
  const points = [{ period: "2009-07", value: 1 }, { period: "2027-12", value: 4 }];
  assert.deepEqual(filterToForecastHorizon(points, null), points);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const originalFetch = global.fetch;
const originalEiaKey = process.env.EIA_API_KEY;

function restoreGlobals() {
  global.fetch = originalFetch;
  if (originalEiaKey === undefined) delete process.env.EIA_API_KEY;
  else process.env.EIA_API_KEY = originalEiaKey;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

function loadOrchestrate() {
  delete require.cache[require.resolve("../lib/market/macro-risk-orchestrate.ts")];
  return load("lib/market/macro-risk-orchestrate.ts");
}

function eiaResponse(rows) {
  return new Response(JSON.stringify({ response: { data: rows } }), { status: 200, headers: { "content-type": "application/json" } });
}

function monthlySeries(seriesId, startValue, months = 24) {
  const rows = [];
  for (let i = 0; i < months; i += 1) {
    const date = new Date(Date.UTC(2026, 5 - i, 1));
    const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    rows.push({ period, value: startValue + i * 3, series: seriesId });
  }
  return rows;
}

function dailySeries(seriesId, startValue, days = 60) {
  const rows = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(Date.UTC(2026, 7, 25 - i));
    const period = date.toISOString().slice(0, 10);
    rows.push({ period, value: startValue - i * 0.01, series: seriesId });
  }
  return rows;
}

function weeklySeries(seriesId, startValue, weeks = 60) {
  const rows = [];
  for (let i = 0; i < weeks; i += 1) {
    const date = new Date(Date.UTC(2026, 7, 14 - i * 7));
    const period = date.toISOString().slice(0, 10);
    rows.push({ period, value: startValue - i * 5, series: seriesId });
  }
  return rows;
}

/**
 * buildStorageComparison needs a real same-ISO-week observation from each of
 * the prior 5 years to compute a five-year average -- a generic N-weeks-back
 * loop doesn't reliably land on the same ISO week every year. Mirrors the
 * proven fixture in tests/macro-analytics.test.cjs exactly (dates chosen so
 * isoWeek() lines up across all 5 prior years), just with a distinct value
 * per row so this suite can verify a real (non-fixture) storage_levels
 * pressurePct comes out the other end.
 */
function fiveYearStorageRows(seriesId) {
  return [
    { period: "2026-08-07", value: 950, series: seriesId },
    { period: "2026-07-31", value: 925, series: seriesId },
    { period: "2025-08-08", value: 1000, series: seriesId },
    { period: "2024-08-09", value: 1000, series: seriesId },
    { period: "2023-08-11", value: 1000, series: seriesId },
    { period: "2022-08-12", value: 1000, series: seriesId },
    { period: "2021-08-13", value: 1000, series: seriesId }
  ];
}

function stateProductionRows() {
  const states = [{ name: "Pennsylvania", base: 700_000 }, { name: "West Virginia", base: 300_000 }, { name: "Ohio", base: 180_000 }];
  const rows = [];
  for (const state of states) {
    for (let i = 0; i < 24; i += 1) {
      const date = new Date(Date.UTC(2026, 4 - i, 1));
      const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      rows.push({ period, value: state.base + i * 500, "area-name": state.name });
    }
  }
  return rows;
}

function demandRows() {
  // EIA_SERIES.demand: residential N3010US2, commercial N3020US2, industrial N3035US2, electricPower N3045US2
  const series = { residential: "N3010US2", commercial: "N3020US2", industrial: "N3035US2", electricPower: "N3045US2" };
  const rows = [];
  for (const [, seriesId] of Object.entries(series)) {
    rows.push(...monthlySeries(seriesId, 500_000, 18));
  }
  return rows;
}

function steoRows() {
  const series = { NGHHMCF: "Henry Hub", NGPRPUS: "Dry Production", NGWGPUS: "Storage", NGEXPUS_LNG: "LNG Exports", NGEPCNS_US: "Power", NGINX_US: "Industrial", NGTCPUS: "Total", NGRCPUS: "Residential", NGCCPUS: "Commercial" };
  const rows = [];
  for (const [seriesId, label] of Object.entries(series)) {
    for (let i = -2; i < 20; i += 1) {
      const date = new Date(Date.UTC(2026, 5 + i, 1));
      const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      rows.push({ period, value: 10 + i, seriesId, seriesDescription: label, unit: "billion cubic feet per day" });
    }
  }
  return rows;
}

/**
 * fetchEiaSeries (Henry Hub only) puts the series in a facets[series][] query
 * param; fetchEiaSeriesById (WTI/Brent/storage/LNG/production/propane) embeds
 * it directly in the URL path as /seriesid/<encoded-id> instead -- both must
 * be checked, or every fetchEiaSeriesById-based metric silently gets an empty
 * mock response and this test suite would pass while proving nothing about
 * six of the seven inputs.
 */
function mockAllSources({ steoFails = false, demandFails = false } = {}) {
  global.fetch = async (url) => {
    const parsed = new URL(url.toString());
    const path = parsed.pathname;
    const seriesFacet = parsed.searchParams.get("facets[series][]");
    const seriesFromPath = decodeURIComponent(path.replace(/^\/v2\/seriesid\//, ""));

    if (path.includes("pri/fut/data")) return eiaResponse(dailySeries("RNGWHHD", 3.2));
    if (seriesFromPath === "PET.RWTC.D" || seriesFacet === "PET.RWTC.D") return eiaResponse(dailySeries("PET.RWTC.D", 80));
    if (seriesFromPath === "PET.RBRTE.D" || seriesFacet === "PET.RBRTE.D") return eiaResponse(dailySeries("PET.RBRTE.D", 85));
    if (seriesFromPath === "NG.NW2_EPG0_SWO_R48_BCF.W" || seriesFacet === "NG.NW2_EPG0_SWO_R48_BCF.W") return eiaResponse(fiveYearStorageRows("NG.NW2_EPG0_SWO_R48_BCF.W"));
    if (seriesFromPath === "NG.N9133US2.M" || seriesFacet === "NG.N9133US2.M") return eiaResponse(monthlySeries("NG.N9133US2.M", 480_000));
    if (seriesFromPath === "NG.N9070US2.M" || seriesFacet === "NG.N9070US2.M") return eiaResponse(monthlySeries("NG.N9070US2.M", 3_300_000));
    if (seriesFromPath === "PET.W_EPLLP0C_SKB_NUS_MBBL.W" || seriesFacet === "PET.W_EPLLP0C_SKB_NUS_MBBL.W") return eiaResponse(weeklySeries("PET.W_EPLLP0C_SKB_NUS_MBBL.W", 70_000));
    if (path.includes("prod/sum/data")) return eiaResponse(stateProductionRows());
    if (path.includes("cons/sum/data")) {
      if (demandFails) throw new Error("demand upstream down");
      return eiaResponse(demandRows());
    }
    if (path.includes("steo/data")) {
      if (steoFails) throw new Error("steo upstream down");
      return eiaResponse(steoRows());
    }
    return eiaResponse([]);
  };
}

test("buildMacroRiskSnapshot: all sources succeed -- all 7 signals evaluated with real values, no crash", { timeout: 15_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  mockAllSources();
  const { buildMacroRiskSnapshot } = loadOrchestrate();
  const snapshot = await buildMacroRiskSnapshot(5);

  assert.equal(snapshot.allSignals.length, 7);
  for (const signal of snapshot.allSignals) {
    assert.notEqual(signal.state, "UNAVAILABLE", `${signal.driver} unexpectedly unavailable -- mock data not reaching this input`);
  }
  const appalachia = snapshot.allSignals.find((s) => s.driver === "appalachia_supply");
  assert.deepEqual(appalachia.metrics[0].label, "PA + WV + OH marketed production");
  const lng = snapshot.allSignals.find((s) => s.driver === "lng_demand");
  assert.match(lng.reason, /STEO forecast horizon/, "STEO forecast direction context present when STEO succeeds");
  assert.ok(snapshot.fingerprint.length > 0);
  assert.ok(snapshot.rankedSignals.length > 0 && snapshot.rankedSignals.length <= 5);
});

test("buildMacroRiskSnapshot: STEO failure degrades only forecast-direction context, not the actual-based LNG/industrial signals", { timeout: 15_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  mockAllSources({ steoFails: true });
  const { buildMacroRiskSnapshot } = loadOrchestrate();
  const snapshot = await buildMacroRiskSnapshot(5);

  const lng = snapshot.allSignals.find((s) => s.driver === "lng_demand");
  assert.notEqual(lng.state, "UNAVAILABLE", "LNG actual YoY still computes even when STEO is down");
  assert.doesNotMatch(lng.reason, /STEO forecast horizon/, "no forecast-direction claim when STEO failed");
});

test("buildMacroRiskSnapshot: demand failure marks power/industrial UNAVAILABLE but leaves price/storage/supply/LNG signals unaffected", { timeout: 15_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  mockAllSources({ demandFails: true });
  const { buildMacroRiskSnapshot } = loadOrchestrate();
  const snapshot = await buildMacroRiskSnapshot(5);

  const power = snapshot.allSignals.find((s) => s.driver === "power_data_center_demand");
  const industrial = snapshot.allSignals.find((s) => s.driver === "industrial_demand");
  assert.equal(power.state, "UNAVAILABLE");
  assert.equal(industrial.state, "UNAVAILABLE");
  const gasPricing = snapshot.allSignals.find((s) => s.driver === "gas_pricing");
  assert.notEqual(gasPricing.state, "UNAVAILABLE");
});

test("buildMacroRiskSnapshot: a stale Henry Hub metric is treated as unavailable, never producing a guessed price-risk state", { timeout: 15_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  global.fetch = async (url) => {
    const parsed = new URL(url.toString());
    const path = parsed.pathname;
    if (path.includes("pri/fut/data")) {
      // Single very old observation -> calculateFreshness marks this "stale".
      return eiaResponse([{ period: "2020-01-01", value: 2.1, series: "RNGWHHD" }]);
    }
    const seriesFacet = parsed.searchParams.get("facets[series][]");
    const seriesFromPath = decodeURIComponent(path.replace(/^\/v2\/seriesid\//, ""));
    if (seriesFromPath === "PET.RWTC.D" || seriesFacet === "PET.RWTC.D") return eiaResponse(dailySeries("PET.RWTC.D", 80));
    if (seriesFromPath === "PET.RBRTE.D" || seriesFacet === "PET.RBRTE.D") return eiaResponse(dailySeries("PET.RBRTE.D", 85));
    if (seriesFromPath === "NG.NW2_EPG0_SWO_R48_BCF.W" || seriesFacet === "NG.NW2_EPG0_SWO_R48_BCF.W") return eiaResponse(fiveYearStorageRows("NG.NW2_EPG0_SWO_R48_BCF.W"));
    if (seriesFromPath === "NG.N9133US2.M" || seriesFacet === "NG.N9133US2.M") return eiaResponse(monthlySeries("NG.N9133US2.M", 480_000));
    if (seriesFromPath === "NG.N9070US2.M" || seriesFacet === "NG.N9070US2.M") return eiaResponse(monthlySeries("NG.N9070US2.M", 3_300_000));
    if (seriesFromPath === "PET.W_EPLLP0C_SKB_NUS_MBBL.W" || seriesFacet === "PET.W_EPLLP0C_SKB_NUS_MBBL.W") return eiaResponse(weeklySeries("PET.W_EPLLP0C_SKB_NUS_MBBL.W", 70_000));
    if (path.includes("prod/sum/data")) return eiaResponse(stateProductionRows());
    if (path.includes("cons/sum/data")) return eiaResponse(demandRows());
    if (path.includes("steo/data")) return eiaResponse(steoRows());
    return eiaResponse([]);
  };

  const { buildMacroRiskSnapshot } = loadOrchestrate();
  const snapshot = await buildMacroRiskSnapshot(5);
  const gasPricing = snapshot.allSignals.find((s) => s.driver === "gas_pricing");
  assert.equal(gasPricing.state, "UNAVAILABLE");
  assert.equal(gasPricing.pressurePct, null);
});

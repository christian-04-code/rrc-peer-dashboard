const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

/**
 * Pure/network-mocked -- collectMacroEvidence(pool=null, ...) needs no
 * Postgres (STEO vintage persistence/comparison is simply skipped, which is
 * itself exercised below as an "optional degradation" case), only a mocked
 * global.fetch standing in for the EIA API. Mirrors
 * tests/macro-risk-orchestrate.test.cjs's proven mocking harness (same
 * fetchers, same routes) -- adapted rather than duplicated wholesale, with
 * one important difference: the storage fixture here must land its LATEST
 * point on an *exact* Friday (isValidStorageWeekEnding's requirement),
 * which that file's DAY_SHIFT-relative-to-a-fixed-reference approach does
 * not guarantee (DAY_SHIFT is not necessarily a multiple of 7). This file's
 * storage fixture instead anchors to "the most recent real Friday" and
 * steps back in exact 7-day increments, which is Friday-exact by
 * construction regardless of what day this suite actually runs.
 */

const originalFetch = global.fetch;
const originalEiaKey = process.env.EIA_API_KEY;

function restoreGlobals() {
  global.fetch = originalFetch;
  if (originalEiaKey === undefined) delete process.env.EIA_API_KEY;
  else process.env.EIA_API_KEY = originalEiaKey;
}
test.afterEach(restoreGlobals);
test.after(restoreGlobals);

function loadAdapter() {
  delete require.cache[require.resolve("../lib/reports/adapters/macro-adapter.ts")];
  return load("lib/reports/adapters/macro-adapter.ts");
}

function eiaResponse(rows) {
  return new Response(JSON.stringify({ response: { data: rows } }), { status: 200, headers: { "content-type": "application/json" } });
}

function mostRecentFriday(from) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const diff = (d.getUTCDay() - 5 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}
const LATEST_FRIDAY = mostRecentFriday(new Date());
const DAY_MS = 24 * 60 * 60 * 1000;

/** Continuous weekly Fridays, most recent first -- Friday-exact by construction (every point is exactly N*7 days before LATEST_FRIDAY). */
function weeklyFridayRows(seriesId, startValue, weeks) {
  const rows = [];
  for (let i = 0; i < weeks; i += 1) {
    const period = new Date(LATEST_FRIDAY.getTime() - i * 7 * DAY_MS).toISOString().slice(0, 10);
    rows.push({ period, value: startValue - i * 2, series: seriesId });
  }
  return rows;
}

function monthlySeries(seriesId, startValue, months = 24) {
  const rows = [];
  for (let i = 0; i < months; i += 1) {
    const date = new Date(Date.UTC(LATEST_FRIDAY.getUTCFullYear(), LATEST_FRIDAY.getUTCMonth() - i, 1));
    const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    rows.push({ period, value: startValue + i * 500, series: seriesId });
  }
  return rows;
}

function dailySeries(seriesId, startValue, days = 40) {
  const rows = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(LATEST_FRIDAY.getTime() - i * DAY_MS);
    rows.push({ period: date.toISOString().slice(0, 10), value: startValue - i * 0.01, series: seriesId });
  }
  return rows;
}

function stateProductionRows() {
  const states = [{ name: "Pennsylvania", base: 700_000 }, { name: "West Virginia", base: 300_000 }, { name: "Ohio", base: 180_000 }];
  const rows = [];
  for (const state of states) {
    for (let i = 0; i < 24; i += 1) {
      const date = new Date(Date.UTC(LATEST_FRIDAY.getUTCFullYear(), LATEST_FRIDAY.getUTCMonth() - i, 1));
      const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      rows.push({ period, value: state.base + i * 500, "area-name": state.name });
    }
  }
  return rows;
}

function demandRows() {
  const series = { residential: "N3010US2", commercial: "N3020US2", industrial: "N3035US2", electricPower: "N3045US2" };
  const rows = [];
  for (const [, seriesId] of Object.entries(series)) rows.push(...monthlySeries(seriesId, 500_000, 18));
  return rows;
}

function steoRows() {
  const series = { NGHHMCF: "Henry Hub", NGPRPUS: "Dry Production", NGWGPUS: "Storage", NGEXPUS_LNG: "LNG Exports", NGEPCNS_US: "Power", NGINX_US: "Industrial", NGTCPUS: "Total", NGRCPUS: "Residential", NGCCPUS: "Commercial" };
  const rows = [];
  for (const [seriesId, label] of Object.entries(series)) {
    for (let i = -2; i < 20; i += 1) {
      const date = new Date(Date.UTC(LATEST_FRIDAY.getUTCFullYear(), LATEST_FRIDAY.getUTCMonth() + i, 1));
      const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      rows.push({ period, value: 10 + i, seriesId, seriesDescription: label, unit: "billion cubic feet per day" });
    }
  }
  return rows;
}

function mockAllSources({ storageWeeks = 40, steoFails = false } = {}) {
  global.fetch = async (url) => {
    const parsed = new URL(url.toString());
    const path = parsed.pathname;
    const seriesFacet = parsed.searchParams.get("facets[series][]");
    const seriesFromPath = decodeURIComponent(path.replace(/^\/v2\/seriesid\//, ""));

    if (path.includes("pri/fut/data")) return eiaResponse(dailySeries("RNGWHHD", 3.2));
    if (seriesFromPath === "NG.NW2_EPG0_SWO_R48_BCF.W" || seriesFacet === "NG.NW2_EPG0_SWO_R48_BCF.W") return eiaResponse(weeklyFridayRows("NG.NW2_EPG0_SWO_R48_BCF.W", 950, storageWeeks));
    if (seriesFromPath === "NG.N9133US2.M" || seriesFacet === "NG.N9133US2.M") return eiaResponse(monthlySeries("NG.N9133US2.M", 3_300_000));
    if (seriesFromPath === "NG.N9070US2.M" || seriesFacet === "NG.N9070US2.M") return eiaResponse(monthlySeries("NG.N9070US2.M", 3_300_000));
    if (path.includes("prod/sum/data")) return eiaResponse(stateProductionRows());
    if (path.includes("cons/sum/data")) return eiaResponse(demandRows());
    if (path.includes("steo/data")) {
      if (steoFails) throw new Error("steo upstream down");
      return eiaResponse(steoRows());
    }
    return eiaResponse([]);
  };
}

test("collectMacroEvidence: derives a valid Friday storage-week identity from the real storage fetch", { timeout: 15_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  mockAllSources();
  const { collectMacroEvidence } = loadAdapter();
  const { isValidStorageWeekEnding } = load("lib/reports/weekly-report-types.ts");

  const collected = await collectMacroEvidence(null, LATEST_FRIDAY);
  assert.equal(collected.storageWeekEndingCandidate, LATEST_FRIDAY.toISOString().slice(0, 10));
  assert.equal(isValidStorageWeekEnding(collected.storageWeekEndingCandidate), true);
  assert.equal(collected.storageObservationPresent, true);
});

test("collectMacroEvidence: storage identity is null (not fabricated) when the storage fetch fails entirely", { timeout: 15_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  global.fetch = async () => {
    throw new Error("network down");
  };
  const { collectMacroEvidence } = loadAdapter();
  const collected = await collectMacroEvidence(null, LATEST_FRIDAY);
  assert.equal(collected.storageWeekEndingCandidate, null);
  assert.equal(collected.storageObservationPresent, false);
});

test("collectMacroEvidence: builds stable, category-correct evidence ids for every core module", { timeout: 15_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  mockAllSources();
  const { collectMacroEvidence } = loadAdapter();
  const collected = await collectMacroEvidence(null, LATEST_FRIDAY);

  assert.equal(collected.modules.gas_pricing?.[0]?.evidenceId, "gas_pricing:henry_hub_spot");
  assert.equal(collected.modules.storage?.[0]?.evidenceId, "storage:lower48");
  assert.equal(collected.modules.us_gas_supply?.[0]?.evidenceId, "us_gas_supply:dry_gas_production");
  assert.equal(collected.modules.appalachia_supply?.[0]?.evidenceId, "appalachia_supply:pa_wv_oh_marketed_production");
  assert.equal(collected.modules.lng_demand?.[0]?.evidenceId, "lng_demand:us_lng_exports");

  // Re-running the exact same inputs (same fixture, same call) must produce the same ids -- stability, not randomness or a DB-generated id.
  const again = await collectMacroEvidence(null, LATEST_FRIDAY);
  assert.equal(again.modules.storage?.[0]?.evidenceId, collected.modules.storage?.[0]?.evidenceId);
});

test("collectMacroEvidence: storage evidence carries a WoW comparison; a short (<5yr) history correctly reports vs5yrAvg as unavailable rather than a fabricated average", { timeout: 15_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  mockAllSources({ storageWeeks: 10 });
  const { collectMacroEvidence } = loadAdapter();
  const collected = await collectMacroEvidence(null, LATEST_FRIDAY);

  const storageItem = collected.modules.storage[0];
  const wow = storageItem.comparisons.find((c) => c.period === "WoW");
  const vs5yr = storageItem.comparisons.find((c) => c.period === "vs5yrAvg");
  assert.equal(wow.direction, "up", "storage fixture values decrease going further into the past (i.e. increase week over week toward the latest point), so WoW should be a real, positive, non-fabricated direction");
  assert.notEqual(wow.currentValue, null);
  assert.equal(vs5yr.direction, "unavailable", "only 10 weeks of history -- nowhere near 5 distinct prior years -- must not fabricate a 5-year average");
  assert.equal(vs5yr.previousValue, null);
});

test("collectMacroEvidence: monthly series (dry gas production) get MoM+YoY, never WoW/vs5yrAvg", { timeout: 15_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  mockAllSources();
  const { collectMacroEvidence } = loadAdapter();
  const collected = await collectMacroEvidence(null, LATEST_FRIDAY);

  const productionItem = collected.modules.us_gas_supply[0];
  const periods = productionItem.comparisons.map((c) => c.period).sort();
  assert.deepEqual(periods, ["MoM", "YoY"]);
});

test("collectMacroEvidence: deterministic_risk_opportunity items point back to their underlying evidence id rather than duplicating its metrics", { timeout: 15_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  mockAllSources();
  const { collectMacroEvidence } = loadAdapter();
  const collected = await collectMacroEvidence(null, LATEST_FRIDAY);

  const riskItems = collected.modules.deterministic_risk_opportunity ?? [];
  assert.ok(riskItems.length > 0);
  for (const item of riskItems) {
    assert.equal(typeof item.metadata.relatedEvidenceId, "string");
    assert.equal(typeof item.metadata.riskRank, "number");
    assert.equal(typeof item.materialityInputs.riskState, "string");
  }
});

test("collectMacroEvidence: STEO evidence degrades gracefully (present with [] comparisons, not a crash) when the upstream STEO fetch fails", { timeout: 15_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  mockAllSources({ steoFails: true });
  const { collectMacroEvidence } = loadAdapter();
  const collected = await collectMacroEvidence(null, LATEST_FRIDAY);

  assert.equal(collected.modules.steo_outlook, undefined, "no STEO evidence when the live fetch itself failed -- never a fabricated placeholder");
  const manifestEntry = collected.manifestEntries.find((entry) => entry.key === "steo_outlook");
  assert.equal(manifestEntry.included, false);
  assert.equal(manifestEntry.freshness, "unavailable");
});

test("collectMacroEvidence: without a DB pool, STEO evidence is still built from the live fetch but with no vintage comparison (steoRevisionHistoryPresent is false)", { timeout: 15_000 }, async () => {
  process.env.EIA_API_KEY = "test-key";
  mockAllSources();
  const { collectMacroEvidence } = loadAdapter();
  const collected = await collectMacroEvidence(null, LATEST_FRIDAY);

  assert.ok(collected.modules.steo_outlook.length > 0);
  for (const item of collected.modules.steo_outlook) {
    assert.deepEqual(item.comparisons, []);
  }
  assert.equal(collected.steoRevisionHistoryPresent, false);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { EIA_MACRO_SOURCE_REGISTRY, getEiaMacroSource, getEiaMacroSourcesByDriver } = load("lib/eia/macro-registry.ts");
const { IMPACT_DRIVERS } = load("lib/range-impact-framework.ts");
const { EIA_SERIES, EIA_STEO_SERIES } = load("lib/eia/series.ts");

test("every registry entry has a unique, non-empty id", () => {
  const ids = EIA_MACRO_SOURCE_REGISTRY.map((source) => source.id);
  assert.ok(ids.every((id) => typeof id === "string" && id.length > 0));
  assert.equal(new Set(ids).size, ids.length, "no duplicate source ids");
});

test("every registry entry declares at least one of seriesId, seriesIds, or facets", () => {
  for (const source of EIA_MACRO_SOURCE_REGISTRY) {
    const hasSeriesId = Boolean(source.seriesId);
    const hasSeriesIds = Boolean(source.seriesIds && source.seriesIds.length > 0);
    const hasFacets = Boolean(source.facets && Object.keys(source.facets).length > 0);
    assert.ok(hasSeriesId || hasSeriesIds || hasFacets, `source "${source.id}" must declare a series identifier or facets`);
  }
});

test("every rangeDriver referenced by the registry is a real key in the shared Range Impact Framework", () => {
  for (const source of EIA_MACRO_SOURCE_REGISTRY) {
    for (const driver of source.rangeDrivers) {
      assert.ok(driver in IMPACT_DRIVERS, `source "${source.id}" references unknown driver "${driver}"`);
    }
  }
});

test("core-relevance sources always declare at least one Range driver; context sources are exempt", () => {
  for (const source of EIA_MACRO_SOURCE_REGISTRY) {
    if (source.rangeRelevance === "core") {
      assert.ok(source.rangeDrivers.length > 0, `core source "${source.id}" must map to at least one Range driver`);
    }
  }
});

test("every verified:true source references a series ID that actually exists in lib/eia/series.ts", () => {
  const allKnownSeriesIds = new Set([
    ...Object.values(EIA_SERIES).flatMap((value) => (typeof value === "string" ? [value] : Object.values(value))),
    ...Object.values(EIA_STEO_SERIES)
  ]);
  for (const source of EIA_MACRO_SOURCE_REGISTRY) {
    if (!source.verified) continue;
    // Facet-identified sources (e.g. state production) have no fixed series
    // ID list to check against EIA_SERIES/EIA_STEO_SERIES -- skip those here.
    if (source.facets) continue;
    const declared = source.seriesId ? [source.seriesId] : (source.seriesIds ?? []);
    for (const id of declared) {
      assert.ok(allKnownSeriesIds.has(id), `verified source "${source.id}" references series "${id}" not present in EIA_SERIES/EIA_STEO_SERIES`);
    }
  }
});

test("regional storage's description explicitly warns against conflating EIA's 'East' census division with Appalachia", () => {
  const regionalStorage = getEiaMacroSource("regional-storage");
  assert.ok(regionalStorage);
  assert.match(regionalStorage.description, /NOT Appalachia/i);
});

test("STEO (forecast) sources use snapshot freshness, not observation freshness", () => {
  const steoSources = EIA_MACRO_SOURCE_REGISTRY.filter((source) => source.category === "forecast");
  assert.ok(steoSources.length > 0);
  for (const source of steoSources) {
    assert.equal(source.freshnessKind, "snapshot", `STEO source "${source.id}" must use snapshot freshness`);
    assert.equal(source.ingestionType, "api_steo");
  }
});

test("getEiaMacroSource finds a real entry and returns undefined for an unknown id", () => {
  assert.equal(getEiaMacroSource("henry-hub-spot").name, "Henry Hub Natural Gas Spot Price");
  assert.equal(getEiaMacroSource("not-a-real-source"), undefined);
});

test("getEiaMacroSourcesByDriver returns every source informing a given driver", () => {
  const gasPricingSources = getEiaMacroSourcesByDriver("gas_pricing");
  const ids = gasPricingSources.map((source) => source.id);
  assert.ok(ids.includes("henry-hub-spot"));
  assert.ok(ids.includes("steo-henry-hub-forecast"));
});

test("no registry entry claims to use XLS/XLSX/CSV ingestion -- every current Range-priority dataset was verified to be API-v2-only this session", () => {
  const validIngestionTypes = new Set(["api_series", "api_table", "api_steo"]);
  for (const source of EIA_MACRO_SOURCE_REGISTRY) {
    assert.ok(validIngestionTypes.has(source.ingestionType), `source "${source.id}" has an unexpected ingestionType`);
  }
});

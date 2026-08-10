const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { extractLiveMarketMetricsWithFallback, buildCurrentMarketPricesFromFmpAndEia } = load("lib/forecast/live-market-prices.ts");

function fmpResponse({ henryHub, wti }) {
  return {
    generatedAt: "2026-08-10T12:00:00.000Z",
    commodities: {
      henryHub: henryHub ?? { value: null, symbol: "NGUSD", source: "FMP", classification: "current-market", status: "unavailable", fetchedAt: "2026-08-10T12:00:00.000Z" },
      wti: wti ?? { value: null, symbol: "CLUSD", source: "FMP", classification: "current-market", status: "unavailable", fetchedAt: "2026-08-10T12:00:00.000Z" }
    },
    equities: {}
  };
}

const eiaMetrics = [
  { id: "henry_hub", label: "Henry Hub", value: 3.5, unit: "$/MMBtu", period: "2026-08-07", fetchedAt: "2026-08-10T00:00:00.000Z", source: "U.S. EIA (RNGWHHD)", classification: "delayed", status: "ok" },
  { id: "wti", label: "WTI", value: 65.2, unit: "$/bbl", period: "2026-08-07", fetchedAt: "2026-08-10T00:00:00.000Z", source: "U.S. EIA (PET.RWTC.D)", classification: "delayed", status: "ok" }
];

test("FMP current-market quote takes priority over EIA when both are valid", () => {
  const fmp = fmpResponse({
    henryHub: { value: 3.21, symbol: "NGUSD", source: "FMP", classification: "current-market", status: "ok", fetchedAt: "2026-08-10T12:00:00.000Z" },
    wti: { value: 64.5, symbol: "CLUSD", source: "FMP", classification: "current-market", status: "ok", fetchedAt: "2026-08-10T12:00:00.000Z" }
  });
  const result = extractLiveMarketMetricsWithFallback(fmp, eiaMetrics);
  assert.equal(result.henryHub.value, 3.21);
  assert.match(result.henryHub.source, /^FMP \(NGUSD\)$/);
  assert.equal(result.wti.value, 64.5);
  assert.match(result.wti.source, /^FMP \(CLUSD\)$/);
});

test("EIA is used as a fallback, independently per commodity, when the FMP quote for that commodity is unavailable", () => {
  const fmp = fmpResponse({
    henryHub: { value: null, symbol: "NGUSD", source: "FMP", classification: "current-market", status: "unavailable", fetchedAt: "2026-08-10T12:00:00.000Z", error: "FMP down" },
    wti: { value: 64.5, symbol: "CLUSD", source: "FMP", classification: "current-market", status: "ok", fetchedAt: "2026-08-10T12:00:00.000Z" }
  });
  const result = extractLiveMarketMetricsWithFallback(fmp, eiaMetrics);
  // Henry Hub falls back to EIA...
  assert.equal(result.henryHub.value, 3.5);
  assert.match(result.henryHub.source, /EIA/);
  // ...while WTI independently stays on FMP, never blended.
  assert.equal(result.wti.value, 64.5);
  assert.match(result.wti.source, /^FMP \(CLUSD\)$/);
});

test("when both FMP and EIA are unavailable, the commodity is omitted so the modeled management-sensitivity default applies upstream", () => {
  const result = extractLiveMarketMetricsWithFallback(fmpResponse({}), []);
  assert.equal(result.henryHub, null);
  assert.equal(result.wti, null);

  const prices = buildCurrentMarketPricesFromFmpAndEia(fmpResponse({}), []);
  assert.equal(prices.henryHubPerMmbtu, undefined);
  assert.equal(prices.wtiPerBbl, undefined);
});

test("a null/undefined FMP response (still loading, or fetch never resolved) falls back to EIA cleanly", () => {
  const result = extractLiveMarketMetricsWithFallback(null, eiaMetrics);
  assert.equal(result.henryHub.value, 3.5);
  assert.equal(result.wti.value, 65.2);
});

test("buildCurrentMarketPricesFromFmpAndEia converts the winning FMP value into a live-classified SourcedValue for the forecast engine", () => {
  const fmp = fmpResponse({
    henryHub: { value: 3.21, symbol: "NGUSD", source: "FMP", classification: "current-market", status: "ok", fetchedAt: "2026-08-10T12:00:00.000Z" }
  });
  const prices = buildCurrentMarketPricesFromFmpAndEia(fmp, eiaMetrics);
  assert.equal(prices.henryHubPerMmbtu.value, 3.21);
  assert.equal(prices.henryHubPerMmbtu.source.classification, "live");
  assert.match(prices.henryHubPerMmbtu.source.notes, /flat/i);
  assert.match(prices.henryHubPerMmbtu.source.notes, /not a futures or forward curve/i);
});

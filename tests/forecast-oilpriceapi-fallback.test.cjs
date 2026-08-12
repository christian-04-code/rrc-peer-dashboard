const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const {
  extractLiveMarketMetricsFromMarketResponse,
  buildCurrentMarketPricesFromMarketResponse,
  resolveCommoditySources,
  buildCurrentMarketPrices
} = load("lib/forecast/live-market-prices.ts");

const { runRrcValuedScenario, defaultRrcValuationAssumptions } = load("lib/forecast/scenarios/rrc-valued.ts");

function oilPriceApiQuote(overrides) {
  return {
    id: "wti",
    label: "WTI",
    code: "WTI_USD",
    price: 82.28,
    unit: "barrel",
    currency: "USD",
    source: "OilPriceAPI",
    classification: "current-market",
    asOf: "2026-08-10T18:31:22.245Z",
    dataStatus: "current",
    stale: false,
    synthetic: false,
    change24hAmount: 5.2,
    change24hPercent: 6.75,
    fetchedAt: "2026-08-10T18:35:51.451Z",
    status: "ok",
    ...overrides
  };
}

function unavailableQuote(id, code, error) {
  return {
    id,
    label: id === "wti" ? "WTI" : "Henry Hub",
    code,
    price: null,
    unit: null,
    currency: null,
    source: "OilPriceAPI",
    classification: "current-market",
    asOf: null,
    dataStatus: null,
    stale: null,
    synthetic: null,
    change24hAmount: null,
    change24hPercent: null,
    fetchedAt: "2026-08-10T18:35:51.451Z",
    status: "unavailable",
    error
  };
}

function eiaMetric(id, label, value, unit) {
  return {
    id,
    label,
    value,
    unit,
    period: "2026-08-03",
    fetchedAt: "2026-08-10T18:35:51.545Z",
    source: `U.S. EIA (${id.toUpperCase()})`,
    classification: "delayed",
    status: value === null ? "unavailable" : "ok"
  };
}

function marketResponse({ wti, henryHub, eiaWti = 81.96, eiaHenryHub = 2.81 } = {}) {
  return {
    generatedAt: "2026-08-10T18:35:51.451Z",
    metrics: [
      eiaMetric("henry_hub", "Henry Hub", eiaHenryHub, "$/MMBtu"),
      eiaMetric("wti", "WTI", eiaWti, "$/bbl"),
      eiaMetric("brent", "Brent", 88.9, "$/bbl")
    ],
    currentMarket: {
      wti: wti ?? oilPriceApiQuote({ id: "wti", code: "WTI_USD", price: 82.28 }),
      henryHub: henryHub ?? oilPriceApiQuote({ id: "henry_hub", code: "NATURAL_GAS_USD", price: 2.79, unit: "mmbtu" })
    }
  };
}

test("1. Forecast prefers OilPriceAPI WTI over EIA WTI when both are valid", () => {
  const result = extractLiveMarketMetricsFromMarketResponse(marketResponse());
  assert.equal(result.wti.value, 82.28);
  assert.match(result.wti.source, /^OilPriceAPI \(WTI_USD\)$/);
});

test("2. Forecast prefers OilPriceAPI Henry Hub over EIA Henry Hub when both are valid", () => {
  const result = extractLiveMarketMetricsFromMarketResponse(marketResponse());
  assert.equal(result.henryHub.value, 2.79);
  assert.match(result.henryHub.source, /^OilPriceAPI \(NATURAL_GAS_USD\)$/);
});

test("3. Missing OilPriceAPI WTI falls back to EIA WTI", () => {
  const data = marketResponse({ wti: unavailableQuote("wti", "WTI_USD", "OilPriceAPI marked this quote stale; not shown as current market.") });
  const result = extractLiveMarketMetricsFromMarketResponse(data);
  assert.equal(result.wti.value, 81.96);
  assert.match(result.wti.source, /U\.S\. EIA/);
});

test("4. Missing OilPriceAPI Henry Hub falls back to EIA Henry Hub", () => {
  const data = marketResponse({ henryHub: unavailableQuote("henry_hub", "NATURAL_GAS_USD", "OilPriceAPI did not return this code.") });
  const result = extractLiveMarketMetricsFromMarketResponse(data);
  assert.equal(result.henryHub.value, 2.81);
  assert.match(result.henryHub.source, /U\.S\. EIA/);
});

test("5. Per-commodity fault isolation: WTI OilPriceAPI ok + Henry Hub OilPriceAPI fails -> WTI stays OilPriceAPI, Henry Hub falls to EIA independently", () => {
  const data = marketResponse({ henryHub: unavailableQuote("henry_hub", "NATURAL_GAS_USD", "network down") });
  const result = extractLiveMarketMetricsFromMarketResponse(data);
  assert.match(result.wti.source, /^OilPriceAPI/);
  assert.equal(result.wti.value, 82.28);
  assert.match(result.henryHub.source, /EIA/);
  assert.equal(result.henryHub.value, 2.81);
});

test("5b. Per-commodity fault isolation: Henry Hub OilPriceAPI ok + WTI OilPriceAPI fails -> Henry Hub stays OilPriceAPI, WTI falls to EIA independently", () => {
  const data = marketResponse({ wti: unavailableQuote("wti", "WTI_USD", "network down") });
  const result = extractLiveMarketMetricsFromMarketResponse(data);
  assert.match(result.henryHub.source, /^OilPriceAPI/);
  assert.equal(result.henryHub.value, 2.79);
  assert.match(result.wti.source, /EIA/);
  assert.equal(result.wti.value, 81.96);
});

test("6. Both OilPriceAPI current values missing -> EIA used for both", () => {
  const data = marketResponse({
    wti: unavailableQuote("wti", "WTI_USD", "network down"),
    henryHub: unavailableQuote("henry_hub", "NATURAL_GAS_USD", "network down")
  });
  const result = extractLiveMarketMetricsFromMarketResponse(data);
  assert.equal(result.wti.value, 81.96);
  assert.match(result.wti.source, /EIA/);
  assert.equal(result.henryHub.value, 2.81);
  assert.match(result.henryHub.source, /EIA/);
});

test("7. OilPriceAPI + EIA both unavailable for a commodity -> field is omitted so the existing modeled fallback in rrc-complete.ts applies", () => {
  const data = marketResponse({
    wti: unavailableQuote("wti", "WTI_USD", "network down"),
    eiaWti: null
  });
  const prices = buildCurrentMarketPricesFromMarketResponse(data);
  assert.equal(prices.wtiPerBbl, undefined);
  // Henry Hub is untouched and still resolves.
  assert.notEqual(prices.henryHubPerMmbtu, undefined);
});

test("8. No unavailable value becomes 0 anywhere in the resolution chain", () => {
  const data = marketResponse({
    wti: unavailableQuote("wti", "WTI_USD", "network down"),
    henryHub: unavailableQuote("henry_hub", "NATURAL_GAS_USD", "network down"),
    eiaWti: null,
    eiaHenryHub: null
  });
  const result = extractLiveMarketMetricsFromMarketResponse(data);
  assert.equal(result.wti, null);
  assert.notEqual(result.wti, 0);
  assert.equal(result.henryHub, null);
  assert.notEqual(result.henryHub, 0);
  const prices = buildCurrentMarketPricesFromMarketResponse(data);
  assert.equal(prices.wtiPerBbl, undefined);
  assert.equal(prices.henryHubPerMmbtu, undefined);
});

test("9. resolveCommoditySources reports classification 'current_market' when OilPriceAPI supplied the value", () => {
  const resolved = resolveCommoditySources(marketResponse());
  assert.equal(resolved.wti.classification, "current_market");
  assert.equal(resolved.wti.value, 82.28);
  assert.equal(resolved.henryHub.classification, "current_market");
  assert.equal(resolved.henryHub.value, 2.79);
});

test("10. resolveCommoditySources reports classification 'official_delayed' when EIA is the fallback source", () => {
  const data = marketResponse({ wti: unavailableQuote("wti", "WTI_USD", "network down") });
  const resolved = resolveCommoditySources(data);
  assert.equal(resolved.wti.classification, "official_delayed");
  assert.equal(resolved.wti.value, 81.96);
  assert.match(resolved.wti.source, /EIA/);
});

test("11. resolveCommoditySources reports 'modeled' when both live sources are unavailable, and does not alter the engine's own modeled-fallback classification in rrc-complete.ts", () => {
  const data = marketResponse({
    wti: unavailableQuote("wti", "WTI_USD", "network down"),
    eiaWti: null
  });
  const resolved = resolveCommoditySources(data);
  assert.equal(resolved.wti.classification, "modeled");
  assert.equal(resolved.wti.value, null);

  const rrcCompleteSource = fs.readFileSync(path.join(process.cwd(), "lib", "forecast", "scenarios", "rrc-complete.ts"), "utf8");
  assert.match(rrcCompleteSource, /classification: "modeled",\s*\n\s*name: "Range Resources management sensitivity case"/);
});

test("12. Forecast formulas produce exactly the same result for identical input values, regardless of whether the value came from OilPriceAPI or EIA (source-selection layer only)", () => {
  const legacyPrices = buildCurrentMarketPrices({
    henryHub: { value: 3.5, period: "2026-08-07", fetchedAt: "2026-08-10T00:00:00.000Z", source: "U.S. EIA (RNGWHHD)" },
    wti: { value: 65, period: "2026-08-07", fetchedAt: "2026-08-10T00:00:00.000Z", source: "U.S. EIA (PET.RWTC.D)" }
  });
  const oilPriceApiPrices = buildCurrentMarketPricesFromMarketResponse(
    marketResponse({
      wti: oilPriceApiQuote({ id: "wti", code: "WTI_USD", price: 65 }),
      henryHub: oilPriceApiQuote({ id: "henry_hub", code: "NATURAL_GAS_USD", price: 3.5, unit: "mmbtu" })
    })
  );

  assert.equal(legacyPrices.henryHubPerMmbtu.value, oilPriceApiPrices.henryHubPerMmbtu.value);
  assert.equal(legacyPrices.wtiPerBbl.value, oilPriceApiPrices.wtiPerBbl.value);

  const legacyResult = runRrcValuedScenario("maintenance", defaultRrcValuationAssumptions, { currentMarketPrices: legacyPrices });
  const oilPriceApiResult = runRrcValuedScenario("maintenance", defaultRrcValuationAssumptions, { currentMarketPrices: oilPriceApiPrices });

  assert.deepEqual(
    legacyResult.complete.forecast.periods.map((p) => p.revenue.totalMillion),
    oilPriceApiResult.complete.forecast.periods.map((p) => p.revenue.totalMillion)
  );
  assert.deepEqual(
    legacyResult.complete.forecast.periods.map((p) => p.ebitdaxMillion),
    oilPriceApiResult.complete.forecast.periods.map((p) => p.ebitdaxMillion)
  );
});

test("13. Bear/Base/Bull EV/EBITDAX multiples are unchanged", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "lib", "forecast", "companies", "rrc.ts"), "utf8");
  assert.match(source, /RRC_VALUATION_PRESETS\s*=\s*\{\s*bear:\s*4\.5,\s*base:\s*5\.5,\s*bull:\s*6\.5\s*\}/);
});

test("14. No Forecast client code directly calls OilPriceAPI -- only /api/market's existing server-side integration does", () => {
  // components/forecast/RrcScenarioWorkbench.tsx legitimately displays the source label
  // string "OilPriceAPI · Current Market" (added in a later task, see
  // tests/forecast-commodity-assumptions.test.cjs) -- that's a display label, not a
  // provider call, so this check is scoped to actual import/env-var/upstream-call
  // patterns rather than the bare word "oilpriceapi" anywhere in the file.
  for (const file of ["components/HomeDashboard.tsx", "components/dashboard/ForecastWorkspacePanel.tsx", "components/forecast/RrcScenarioWorkbench.tsx"]) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /lib\/oilpriceapi\/client/, `${file} must not import the OilPriceAPI client`);
    assert.doesNotMatch(source, /OIL_PRICE_API/, `${file} must not reference the OilPriceAPI env var`);
    assert.doesNotMatch(source, /api\.oilpriceapi\.com/, `${file} must not call OilPriceAPI directly`);
  }
  const liveMarketPricesSource = fs.readFileSync(path.join(process.cwd(), "lib", "forecast", "live-market-prices.ts"), "utf8");
  assert.doesNotMatch(liveMarketPricesSource, /lib\/oilpriceapi\/client/, "must only consume the normalized /api/market types, never the provider client");
  assert.doesNotMatch(liveMarketPricesSource, /fetch\(/, "must not make its own upstream request");
});

test("Brent is out of scope for Forecast: extractLiveMarketMetricsFromMarketResponse only ever reads currentMarket.wti/currentMarket.henryHub", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "lib", "forecast", "live-market-prices.ts"), "utf8");
  const fnBody = source.slice(source.indexOf("export function extractLiveMarketMetricsFromMarketResponse"));
  assert.doesNotMatch(fnBody.slice(0, fnBody.indexOf("\n}\n")), /currentMarket\.brent|currentMarket\?\.brent/i);
});

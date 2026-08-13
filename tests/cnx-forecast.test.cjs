const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const golden = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/cnx-forecast-golden.json"), "utf8"));
const { getCompanyForecast, runCompanyForecast } = load("lib/forecast/api.ts");
const { getForecastCompanyAdapter } = load("lib/forecast/companies/index.ts");
const guidanceTypes = load("lib/forecast/guidance/types.ts");
const cnxGuidance = load("lib/forecast/guidance/cnx.ts");

function baseBody(extra = {}) {
  return {
    production: {},
    costs: {},
    capex: {},
    pricing: {},
    commodityMode: "current-market",
    valuation: { targetEvToEbitdax: 6.4, forwardYear: "2027" },
    ...extra
  };
}

test("CNX is registered as a supported adapter with dynamic periods matching the golden capture", () => {
  const response = getCompanyForecast("CNX");
  assert.equal(response.company.ticker, "CNX");
  assert.equal(response.company.supported, true);
  assert.deepEqual(response.company.periods.forecastYears, golden.get.forecastYears);
  assert.equal(response.company.periods.latestActualPeriod, golden.get.latestActualPeriod);
  assert.equal(response.defaults.currentNetDebtMillion, golden.get.currentNetDebtMillion);
  assert.equal(response.defaults.dilutedSharesMillion, golden.get.dilutedSharesMillion);
  const configuration = getForecastCompanyAdapter("CNX").configuration;
  assert.equal(configuration.balanceSheet.netDebtMillion, golden.get.currentNetDebtMillion);
  assert.equal(configuration.hedges.status, "unavailable");
  for (const year of golden.get.forecastYears) {
    assert.equal(response.result.annual[year].production.totalMcfe, golden.get.totalMcfe[year]);
  }
});

test("CNX guidance mapping: FY2026 production is an annual Bcfe total converted to a daily rate", () => {
  const production = guidanceTypes.findGuidance(cnxGuidance.cnxManagementGuidance, "totalProductionBcfePerDay", "2026");
  assert.ok(Math.abs(production.midpoint - 612.5 / 365) < 1e-9);
  const capex = guidanceTypes.findGuidance(cnxGuidance.cnxManagementGuidance, "capexTotalMillion", "2026");
  assert.equal(capex.midpoint, 571);
  const gasBasis = guidanceTypes.findGuidance(cnxGuidance.cnxManagementGuidance, "gasBasisPerMcf", "2026");
  assert.equal(gasBasis.midpoint, -0.59);
});

test("CNX's own NYMEX gas-price planning assumption and NGL price helpers are wired to the current cycle", () => {
  assert.equal(cnxGuidance.cnxGuidedGasPriceAssumptionPerMmbtu(), 3.55);
  assert.equal(cnxGuidance.cnxGuidedNglPricePerBbl(), 24.6);
  assert.equal(cnxGuidance.cnxGuidedFullyBurdenedCashCostPerMcfe(), 1.15);
});

test("generic POST matches the captured CNX default forecast", () => {
  const result = runCompanyForecast("CNX", baseBody()).result;
  for (const year of golden.get.forecastYears) {
    assert.equal(result.annual[year].ebitdaxMillion, golden.post.default.ebitdaxMillion[year]);
    assert.equal(result.annual[year].freeCashFlowMillion, golden.post.default.freeCashFlowMillion[year]);
  }
  assert.equal(result.valuation.impliedSharePrice, golden.post.default.impliedSharePrice);
});

for (const [name, fixture] of Object.entries({
  productionOverride: golden.post.productionOverride,
  commodityOverride: golden.post.commodityOverride,
  multipleSparseOverrides: golden.post.multipleSparseOverrides,
  valuationMultiple: golden.post.valuationMultiple,
  forwardYear: golden.post.forwardYear
})) {
  test(`golden CNX scenario: ${name}`, () => {
    const body = baseBody(fixture.request);
    if (fixture.request.valuation) body.valuation = fixture.request.valuation;
    const result = runCompanyForecast("CNX", body).result;
    if (fixture.ebitdax2027Million) assert.equal(result.annual["2027"].ebitdaxMillion, fixture.ebitdax2027Million);
    if (fixture.ebitdax2028Million) assert.equal(result.annual["2028"].ebitdaxMillion, fixture.ebitdax2028Million);
    if (fixture.forwardEbitdaxMillion) assert.equal(result.valuation.forwardEbitdaxMillion, fixture.forwardEbitdaxMillion);
    assert.equal(result.valuation.impliedSharePrice, fixture.impliedSharePrice);
  });
}

test("reset/default after CNX overrides has no state leakage", () => {
  const before = runCompanyForecast("CNX", baseBody()).result;
  runCompanyForecast("CNX", baseBody(golden.post.productionOverride.request));
  const reset = runCompanyForecast("CNX", baseBody()).result;
  assert.deepEqual(reset, before);
});

test("CNX sparse overrides carry field-level provenance without relabeling untouched fields", () => {
  const response = runCompanyForecast("CNX", baseBody({
    production: { "2027": { gasMmcfPerDay: 1600 } },
    customCommodity: { henryHubPerMmbtu: 5 }
  }));
  assert.equal(response.fieldProvenance["production.2027.gasMmcfPerDay"], "user_override");
  assert.equal(response.fieldProvenance["production.2027.nglMbblPerDay"], "derived_guidance");
  assert.equal(response.fieldProvenance["commodity.henryHubPerMmbtu"], "user_override");
  assert.equal(response.fieldProvenance["commodity.wtiPerBbl"], "model");
  assert.equal(response.fieldProvenance["pricing.2026.gasBasisPerMcf"], "management_guidance");
});

test("CNX, AR, and RRC forecasts are isolated from each other", () => {
  const rrcBefore = getCompanyForecast("RRC").result;
  const arBefore = getCompanyForecast("AR").result;
  runCompanyForecast("CNX", baseBody(golden.post.commodityOverride.request));
  assert.deepEqual(getCompanyForecast("RRC").result, rrcBefore);
  assert.deepEqual(getCompanyForecast("AR").result, arBefore);
});

test("malformed CNX requests fail instead of silently defaulting", () => {
  assert.throws(() => runCompanyForecast("CNX", { production: { "2027": { gasMmcfPerDay: "not-a-number" } } }), /finite number/);
  assert.throws(() => runCompanyForecast("CNX", { production: { "2029": { gasMmcfPerDay: 1900 } } }), /outside the active forecast window/);
  assert.throws(() => runCompanyForecast("CNX", { valuation: { forwardYear: "2029" } }), /forwardYear/);
});

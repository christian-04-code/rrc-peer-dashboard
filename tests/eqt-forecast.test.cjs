const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const golden = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/eqt-forecast-golden.json"), "utf8"));
const { getCompanyForecast, runCompanyForecast } = load("lib/forecast/api.ts");
const { getForecastCompanyAdapter } = load("lib/forecast/companies/index.ts");
const guidanceTypes = load("lib/forecast/guidance/types.ts");
const eqtGuidance = load("lib/forecast/guidance/eqt.ts");

function baseBody(extra = {}) {
  return {
    production: {},
    costs: {},
    capex: {},
    pricing: {},
    commodityMode: "current-market",
    valuation: { targetEvToEbitdax: 8.0, forwardYear: "2027" },
    ...extra
  };
}

test("EQT is registered as a supported adapter with dynamic periods matching the golden capture", () => {
  const response = getCompanyForecast("EQT");
  assert.equal(response.company.ticker, "EQT");
  assert.equal(response.company.supported, true);
  assert.deepEqual(response.company.periods.forecastYears, golden.get.forecastYears);
  assert.equal(response.company.periods.latestActualPeriod, golden.get.latestActualPeriod);
  assert.equal(response.defaults.currentNetDebtMillion, golden.get.currentNetDebtMillion);
  assert.equal(response.defaults.dilutedSharesMillion, golden.get.dilutedSharesMillion);
  const configuration = getForecastCompanyAdapter("EQT").configuration;
  assert.equal(configuration.balanceSheet.netDebtMillion, golden.get.currentNetDebtMillion);
  assert.equal(configuration.hedges.status, "unavailable");
  for (const year of golden.get.forecastYears) {
    assert.equal(response.result.annual[year].production.totalMcfe, golden.get.totalMcfe[year]);
  }
});

test("EQT capital budget is derived from two separately-guided FY2026 figures (maintenance + growth)", () => {
  const capex = guidanceTypes.findGuidance(eqtGuidance.eqtManagementGuidance, "capexTotalMillion", "2026");
  assert.equal(capex.midpoint, 2725);
  assert.match(capex.notes, /derived/i);
});

test("EQT gathering/transmission/processing components are summed and production tax is unit-converted", () => {
  const gpt = guidanceTypes.findGuidance(eqtGuidance.eqtManagementGuidance, "gatheringTransportPerMcfe", "2026");
  assert.ok(Math.abs(gpt.midpoint - 0.62) < 1e-9);
  const prodTax = guidanceTypes.findGuidance(eqtGuidance.eqtManagementGuidance, "productionTaxPerMcfe", "2026");
  assert.ok(prodTax.midpoint > 0.02 && prodTax.midpoint < 0.03);
  assert.equal(eqtGuidance.eqtGuidedLiquidsMbblPerDay(), 14600 / 365);
});

test("generic POST matches the captured EQT default forecast", () => {
  const result = runCompanyForecast("EQT", baseBody()).result;
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
  test(`golden EQT scenario: ${name}`, () => {
    const body = baseBody(fixture.request);
    if (fixture.request.valuation) body.valuation = fixture.request.valuation;
    const result = runCompanyForecast("EQT", body).result;
    if (fixture.ebitdax2027Million) assert.equal(result.annual["2027"].ebitdaxMillion, fixture.ebitdax2027Million);
    if (fixture.ebitdax2028Million) assert.equal(result.annual["2028"].ebitdaxMillion, fixture.ebitdax2028Million);
    if (fixture.forwardEbitdaxMillion) assert.equal(result.valuation.forwardEbitdaxMillion, fixture.forwardEbitdaxMillion);
    assert.equal(result.valuation.impliedSharePrice, fixture.impliedSharePrice);
  });
}

test("reset/default after EQT overrides has no state leakage", () => {
  const before = runCompanyForecast("EQT", baseBody()).result;
  runCompanyForecast("EQT", baseBody(golden.post.productionOverride.request));
  const reset = runCompanyForecast("EQT", baseBody()).result;
  assert.deepEqual(reset, before);
});

test("EQT sparse overrides carry field-level provenance without relabeling untouched fields", () => {
  const response = runCompanyForecast("EQT", baseBody({
    production: { "2027": { gasMmcfPerDay: 6500 } },
    customCommodity: { henryHubPerMmbtu: 5 }
  }));
  assert.equal(response.fieldProvenance["production.2027.gasMmcfPerDay"], "user_override");
  assert.equal(response.fieldProvenance["production.2027.nglMbblPerDay"], "derived_guidance");
  assert.equal(response.fieldProvenance["commodity.henryHubPerMmbtu"], "user_override");
  assert.equal(response.fieldProvenance["commodity.wtiPerBbl"], "model");
  assert.equal(response.fieldProvenance["costs.2026.loePerMcfe"], "management_guidance");
  assert.equal(response.fieldProvenance["pricing.2026.gasBasisPerMcf"], "actual");
});

test("EQT, CNX, AR, and RRC forecasts are isolated from each other", () => {
  const rrcBefore = getCompanyForecast("RRC").result;
  const arBefore = getCompanyForecast("AR").result;
  const cnxBefore = getCompanyForecast("CNX").result;
  runCompanyForecast("EQT", baseBody(golden.post.commodityOverride.request));
  assert.deepEqual(getCompanyForecast("RRC").result, rrcBefore);
  assert.deepEqual(getCompanyForecast("AR").result, arBefore);
  assert.deepEqual(getCompanyForecast("CNX").result, cnxBefore);
});

test("malformed EQT requests fail instead of silently defaulting", () => {
  assert.throws(() => runCompanyForecast("EQT", { production: { "2027": { gasMmcfPerDay: "not-a-number" } } }), /finite number/);
  assert.throws(() => runCompanyForecast("EQT", { production: { "2029": { gasMmcfPerDay: 1900 } } }), /outside the active forecast window/);
  assert.throws(() => runCompanyForecast("EQT", { valuation: { forwardYear: "2029" } }), /forwardYear/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const golden = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/exe-forecast-golden.json"), "utf8"));
const { getCompanyForecast, runCompanyForecast } = load("lib/forecast/api.ts");
const { getForecastCompanyAdapter } = load("lib/forecast/companies/index.ts");
const guidanceTypes = load("lib/forecast/guidance/types.ts");
const exeGuidance = load("lib/forecast/guidance/exe.ts");

function baseBody(extra = {}) {
  return {
    production: {},
    costs: {},
    capex: {},
    pricing: {},
    commodityMode: "current-market",
    valuation: { targetEvToEbitdax: 5.2, forwardYear: "2027" },
    ...extra
  };
}

test("EXE is registered as a supported adapter with dynamic periods matching the golden capture", () => {
  const response = getCompanyForecast("EXE");
  assert.equal(response.company.ticker, "EXE");
  assert.equal(response.company.supported, true);
  assert.deepEqual(response.company.periods.forecastYears, golden.get.forecastYears);
  assert.equal(response.company.periods.latestActualPeriod, golden.get.latestActualPeriod);
  assert.equal(response.defaults.currentNetDebtMillion, golden.get.currentNetDebtMillion);
  assert.equal(response.defaults.dilutedSharesMillion, golden.get.dilutedSharesMillion);
  const configuration = getForecastCompanyAdapter("EXE").configuration;
  assert.equal(configuration.balanceSheet.netDebtMillion, golden.get.currentNetDebtMillion);
  assert.equal(configuration.hedges.status, "unavailable");
  for (const year of golden.get.forecastYears) {
    assert.equal(response.result.annual[year].production.totalMcfe, golden.get.totalMcfe[year]);
  }
});

test("EXE production guidance uses the corrected 7,500 MMcfe/d midpoint, not the old malformed 7.5 (MMcfe/d) figure", () => {
  const production = guidanceTypes.findGuidance(exeGuidance.exeManagementGuidance, "totalProductionBcfePerDay", "2026");
  assert.ok(Math.abs(production.midpoint - 7.5) < 1e-9, `expected 7.5 Bcfe/d, got ${production.midpoint}`);
  assert.equal(production.low, 7.4);
  assert.equal(production.high, 7.6);
});

test("EXE's derived gathering/transport, production-tax, and NGL/interest guidance-layer extensions reconcile to their documented formulas", () => {
  const gpt = guidanceTypes.findGuidance(exeGuidance.exeManagementGuidance, "gatheringTransportPerMcfe", "2026");
  assert.ok(Math.abs(gpt.midpoint - 1.07) < 1e-9);
  const productionTax = guidanceTypes.findGuidance(exeGuidance.exeManagementGuidance, "productionTaxPerMcfe", "2026");
  assert.ok(Math.abs(productionTax.midpoint - 0.09 / 2.6893) < 1e-9);
  assert.equal(exeGuidance.exeGuidedInterestExpenseMillion(), 185);
  assert.equal(exeGuidance.exeGuidedNglPricePerBbl(), 24);
});

test("generic POST matches the captured EXE default forecast", () => {
  const result = runCompanyForecast("EXE", baseBody()).result;
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
  test(`golden EXE scenario: ${name}`, () => {
    const body = baseBody(fixture.request);
    if (fixture.request.valuation) body.valuation = fixture.request.valuation;
    const result = runCompanyForecast("EXE", body).result;
    if (fixture.ebitdax2027Million) assert.equal(result.annual["2027"].ebitdaxMillion, fixture.ebitdax2027Million);
    if (fixture.ebitdax2028Million) assert.equal(result.annual["2028"].ebitdaxMillion, fixture.ebitdax2028Million);
    if (fixture.forwardEbitdaxMillion) assert.equal(result.valuation.forwardEbitdaxMillion, fixture.forwardEbitdaxMillion);
    assert.equal(result.valuation.impliedSharePrice, fixture.impliedSharePrice);
  });
}

test("reset/default after EXE overrides has no state leakage", () => {
  const before = runCompanyForecast("EXE", baseBody()).result;
  runCompanyForecast("EXE", baseBody(golden.post.productionOverride.request));
  const reset = runCompanyForecast("EXE", baseBody()).result;
  assert.deepEqual(reset, before);
});

test("EXE sparse overrides carry field-level provenance without relabeling untouched fields", () => {
  const response = runCompanyForecast("EXE", baseBody({
    production: { "2027": { gasMmcfPerDay: 7200 } },
    customCommodity: { henryHubPerMmbtu: 5 }
  }));
  assert.equal(response.fieldProvenance["production.2027.gasMmcfPerDay"], "user_override");
  assert.equal(response.fieldProvenance["production.2027.nglMbblPerDay"], "management_guidance");
  assert.equal(response.fieldProvenance["commodity.henryHubPerMmbtu"], "user_override");
  assert.equal(response.fieldProvenance["commodity.wtiPerBbl"], "model");
  assert.equal(response.fieldProvenance["costs.2026.gatheringTransportPerMcfe"], "derived_guidance");
  assert.equal(response.fieldProvenance["costs.2026.cashTaxRate"], "model");
});

test("EXE, CRK, and RRC forecasts are isolated from each other", () => {
  const rrcBefore = getCompanyForecast("RRC").result;
  const crkBefore = getCompanyForecast("CRK").result;
  runCompanyForecast("EXE", baseBody(golden.post.commodityOverride.request));
  assert.deepEqual(getCompanyForecast("RRC").result, rrcBefore);
  assert.deepEqual(getCompanyForecast("CRK").result, crkBefore);
});

test("malformed EXE requests fail instead of silently defaulting", () => {
  assert.throws(() => runCompanyForecast("EXE", { production: { "2027": { gasMmcfPerDay: "not-a-number" } } }), /finite number/);
  assert.throws(() => runCompanyForecast("EXE", { production: { "2029": { gasMmcfPerDay: 7500 } } }), /outside the active forecast window/);
  assert.throws(() => runCompanyForecast("EXE", { valuation: { forwardYear: "2029" } }), /forwardYear/);
});

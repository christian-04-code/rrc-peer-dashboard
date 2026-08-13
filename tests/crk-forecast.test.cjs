const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const golden = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/crk-forecast-golden.json"), "utf8"));
const { getCompanyForecast, runCompanyForecast } = load("lib/forecast/api.ts");
const { getForecastCompanyAdapter } = load("lib/forecast/companies/index.ts");
const guidanceTypes = load("lib/forecast/guidance/types.ts");
const crkGuidance = load("lib/forecast/guidance/crk.ts");

function baseBody(extra = {}) {
  return {
    production: {},
    costs: {},
    capex: {},
    pricing: {},
    commodityMode: "current-market",
    valuation: { targetEvToEbitdax: 9.3, forwardYear: "2027" },
    ...extra
  };
}

test("CRK is registered as a supported adapter with dynamic periods matching the golden capture", () => {
  const response = getCompanyForecast("CRK");
  assert.equal(response.company.ticker, "CRK");
  assert.equal(response.company.supported, true);
  assert.deepEqual(response.company.periods.forecastYears, golden.get.forecastYears);
  assert.equal(response.company.periods.latestActualPeriod, golden.get.latestActualPeriod);
  assert.equal(response.defaults.currentNetDebtMillion, golden.get.currentNetDebtMillion);
  assert.equal(response.defaults.dilutedSharesMillion, golden.get.dilutedSharesMillion);
  const configuration = getForecastCompanyAdapter("CRK").configuration;
  assert.equal(configuration.balanceSheet.netDebtMillion, golden.get.currentNetDebtMillion);
  assert.equal(configuration.hedges.status, "unavailable");
  for (const year of golden.get.forecastYears) {
    assert.equal(response.result.annual[year].production.totalMcfe, golden.get.totalMcfe[year]);
  }
});

test("CRK guidance mapping: FY2026 production is a daily MMcfe/d rate converted to this engine's Bcfe/d convention", () => {
  const production = guidanceTypes.findGuidance(crkGuidance.crkManagementGuidance, "totalProductionBcfePerDay", "2026");
  assert.ok(Math.abs(production.midpoint - 1.325) < 1e-9);
  const capex = guidanceTypes.findGuidance(crkGuidance.crkManagementGuidance, "capexTotalMillion", "2026");
  assert.equal(capex.midpoint, 1500);
  const loe = guidanceTypes.findGuidance(crkGuidance.crkManagementGuidance, "loePerMcfe", "2026");
  assert.equal(loe.midpoint, 0.27);
});

test("CRK's derived production-tax, cash G&A, and cash-tax-rate guidance entries reconcile to their documented formulas", () => {
  const productionTax = guidanceTypes.findGuidance(crkGuidance.crkManagementGuidance, "productionTaxPerMcfe", "2026");
  assert.ok(Math.abs(productionTax.midpoint - 0.125 / 2.5483) < 1e-9);
  const cashGa = guidanceTypes.findGuidance(crkGuidance.crkManagementGuidance, "cashGaPerMcfe", "2026");
  assert.ok(Math.abs(cashGa.midpoint - (39 * 1_000_000) / (1.325 * 1000 * 365 * 1000)) < 1e-6);
  const cashTaxRate = guidanceTypes.findGuidance(crkGuidance.crkManagementGuidance, "cashTaxRate", "2026");
  assert.ok(Math.abs(cashTaxRate.midpoint - 0.0023) < 1e-9);
  assert.equal(crkGuidance.crkGuidedCashInterestMillion(), 230);
});

test("generic POST matches the captured CRK default forecast", () => {
  const result = runCompanyForecast("CRK", baseBody()).result;
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
  test(`golden CRK scenario: ${name}`, () => {
    const body = baseBody(fixture.request);
    if (fixture.request.valuation) body.valuation = fixture.request.valuation;
    const result = runCompanyForecast("CRK", body).result;
    if (fixture.ebitdax2027Million) assert.equal(result.annual["2027"].ebitdaxMillion, fixture.ebitdax2027Million);
    if (fixture.ebitdax2028Million) assert.equal(result.annual["2028"].ebitdaxMillion, fixture.ebitdax2028Million);
    if (fixture.forwardEbitdaxMillion) assert.equal(result.valuation.forwardEbitdaxMillion, fixture.forwardEbitdaxMillion);
    assert.equal(result.valuation.impliedSharePrice, fixture.impliedSharePrice);
  });
}

test("reset/default after CRK overrides has no state leakage", () => {
  const before = runCompanyForecast("CRK", baseBody()).result;
  runCompanyForecast("CRK", baseBody(golden.post.productionOverride.request));
  const reset = runCompanyForecast("CRK", baseBody()).result;
  assert.deepEqual(reset, before);
});

test("CRK sparse overrides carry field-level provenance without relabeling untouched fields", () => {
  const response = runCompanyForecast("CRK", baseBody({
    production: { "2027": { gasMmcfPerDay: 1500 } },
    customCommodity: { henryHubPerMmbtu: 5 }
  }));
  assert.equal(response.fieldProvenance["production.2027.gasMmcfPerDay"], "user_override");
  assert.equal(response.fieldProvenance["production.2027.nglMbblPerDay"], "model");
  assert.equal(response.fieldProvenance["commodity.henryHubPerMmbtu"], "user_override");
  assert.equal(response.fieldProvenance["commodity.wtiPerBbl"], "model");
  assert.equal(response.fieldProvenance["costs.2026.loePerMcfe"], "management_guidance");
  assert.equal(response.fieldProvenance["costs.2026.cashGaPerMcfe"], "derived_guidance");
});

test("CRK, CNX, and RRC forecasts are isolated from each other", () => {
  const rrcBefore = getCompanyForecast("RRC").result;
  const cnxBefore = getCompanyForecast("CNX").result;
  runCompanyForecast("CRK", baseBody(golden.post.commodityOverride.request));
  assert.deepEqual(getCompanyForecast("RRC").result, rrcBefore);
  assert.deepEqual(getCompanyForecast("CNX").result, cnxBefore);
});

test("malformed CRK requests fail instead of silently defaulting", () => {
  assert.throws(() => runCompanyForecast("CRK", { production: { "2027": { gasMmcfPerDay: "not-a-number" } } }), /finite number/);
  assert.throws(() => runCompanyForecast("CRK", { production: { "2029": { gasMmcfPerDay: 1400 } } }), /outside the active forecast window/);
  assert.throws(() => runCompanyForecast("CRK", { valuation: { forwardYear: "2029" } }), /forwardYear/);
});

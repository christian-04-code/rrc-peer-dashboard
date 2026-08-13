const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const golden = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/ar-forecast-golden.json"), "utf8"));
const { getCompanyForecast, runCompanyForecast } = load("lib/forecast/api.ts");
const { getForecastCompanyAdapter } = load("lib/forecast/companies/index.ts");
const guidanceTypes = load("lib/forecast/guidance/types.ts");
const arGuidance = load("lib/forecast/guidance/ar.ts");

function baseBody(extra = {}) {
  return {
    production: {},
    costs: {},
    capex: {},
    pricing: {},
    commodityMode: "current-market",
    valuation: { targetEvToEbitdax: 5.7, forwardYear: "2027" },
    ...extra
  };
}

test("AR is registered as a supported adapter with dynamic periods matching the golden capture", () => {
  const response = getCompanyForecast("AR");
  assert.equal(response.company.ticker, "AR");
  assert.equal(response.company.supported, true);
  assert.deepEqual(response.company.periods.forecastYears, golden.get.forecastYears);
  assert.equal(response.company.periods.latestActualPeriod, golden.get.latestActualPeriod);
  assert.equal(response.defaults.currentNetDebtMillion, golden.get.currentNetDebtMillion);
  assert.equal(response.defaults.dilutedSharesMillion, golden.get.dilutedSharesMillion);
  const configuration = getForecastCompanyAdapter("AR").configuration;
  assert.equal(configuration.balanceSheet.netDebtMillion, golden.get.currentNetDebtMillion);
  assert.equal(configuration.hedges.status, "unavailable");
  for (const year of golden.get.forecastYears) {
    assert.equal(response.result.annual[year].production.totalMcfe, golden.get.totalMcfe[year]);
  }
});

test("AR guidance mapping: FY2026 production uses the current Q2 2026 cycle, not the stale Q1 raise", () => {
  const production = guidanceTypes.findGuidance(arGuidance.arManagementGuidance, "totalProductionBcfePerDay", "2026");
  assert.equal(production.low, 4.15);
  assert.equal(production.high, 4.2);
  assert.ok(Math.abs(production.midpoint - 4.175) < 1e-9);
  // AR's FY2027 production target (4.3-4.5 Bcfe/d) came from the Q1 2026 cycle and was
  // not reconfirmed in Q2 2026, so it must not appear as current-cycle guidance.
  assert.equal(guidanceTypes.findGuidance(arGuidance.arManagementGuidance, "totalProductionBcfePerDay", "2027"), undefined);
});

test("AR capex total is derived from committed components, excluding conditional discretionary growth capital", () => {
  const capex = guidanceTypes.findGuidance(arGuidance.arManagementGuidance, "capexTotalMillion", "2026");
  assert.equal(capex.midpoint, 1100);
  assert.match(capex.notes, /derived/i);
});

test("generic POST matches the captured AR default forecast", () => {
  const result = runCompanyForecast("AR", baseBody()).result;
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
  test(`golden AR scenario: ${name}`, () => {
    const body = baseBody(fixture.request);
    if (fixture.request.valuation) body.valuation = fixture.request.valuation;
    const result = runCompanyForecast("AR", body).result;
    if (fixture.ebitdax2027Million) assert.equal(result.annual["2027"].ebitdaxMillion, fixture.ebitdax2027Million);
    if (fixture.ebitdax2028Million) assert.equal(result.annual["2028"].ebitdaxMillion, fixture.ebitdax2028Million);
    if (fixture.forwardEbitdaxMillion) assert.equal(result.valuation.forwardEbitdaxMillion, fixture.forwardEbitdaxMillion);
    assert.equal(result.valuation.impliedSharePrice, fixture.impliedSharePrice);
  });
}

test("reset/default after AR overrides has no state leakage", () => {
  const before = runCompanyForecast("AR", baseBody()).result;
  runCompanyForecast("AR", baseBody(golden.post.productionOverride.request));
  const reset = runCompanyForecast("AR", baseBody()).result;
  assert.deepEqual(reset, before);
});

test("AR sparse overrides carry field-level provenance without relabeling untouched fields", () => {
  const response = runCompanyForecast("AR", baseBody({
    production: { "2027": { gasMmcfPerDay: 2900 } },
    customCommodity: { henryHubPerMmbtu: 5 }
  }));
  assert.equal(response.fieldProvenance["production.2027.gasMmcfPerDay"], "user_override");
  assert.equal(response.fieldProvenance["production.2027.nglMbblPerDay"], "derived_guidance");
  assert.equal(response.fieldProvenance["commodity.henryHubPerMmbtu"], "user_override");
  assert.equal(response.fieldProvenance["commodity.wtiPerBbl"], "model");
  assert.equal(response.fieldProvenance["pricing.2026.gasBasisPerMcf"], "management_guidance");
  assert.equal(response.fieldProvenance["pricing.2027.gasBasisPerMcf"], "management_guidance");
});

test("AR and RRC forecasts are isolated from each other", () => {
  const rrcBefore = getCompanyForecast("RRC").result;
  getCompanyForecast("AR");
  runCompanyForecast("AR", baseBody(golden.post.commodityOverride.request));
  assert.deepEqual(getCompanyForecast("RRC").result, rrcBefore);
});

test("malformed AR requests fail instead of silently defaulting", () => {
  assert.throws(() => runCompanyForecast("AR", { production: { "2027": { gasMmcfPerDay: "not-a-number" } } }), /finite number/);
  assert.throws(() => runCompanyForecast("AR", { production: { "2029": { gasMmcfPerDay: 1900 } } }), /outside the active forecast window/);
  assert.throws(() => runCompanyForecast("AR", { valuation: { forwardYear: "2029" } }), /forwardYear/);
});

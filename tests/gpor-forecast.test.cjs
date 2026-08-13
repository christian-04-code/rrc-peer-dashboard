const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const golden = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/gpor-forecast-golden.json"), "utf8"));
const { getCompanyForecast, runCompanyForecast } = load("lib/forecast/api.ts");
const { getForecastCompanyAdapter } = load("lib/forecast/companies/index.ts");
const guidanceTypes = load("lib/forecast/guidance/types.ts");
const gporGuidance = load("lib/forecast/guidance/gpor.ts");

function baseBody(extra = {}) {
  return {
    production: {},
    costs: {},
    capex: {},
    pricing: {},
    commodityMode: "current-market",
    valuation: { targetEvToEbitdax: 5.5, forwardYear: "2027" },
    ...extra
  };
}

test("GPOR is registered as a supported adapter with dynamic periods matching the golden capture", () => {
  const response = getCompanyForecast("GPOR");
  assert.equal(response.company.ticker, "GPOR");
  assert.equal(response.company.supported, true);
  assert.deepEqual(response.company.periods.forecastYears, golden.get.forecastYears);
  assert.equal(response.company.periods.latestActualPeriod, golden.get.latestActualPeriod);
  assert.equal(response.defaults.currentNetDebtMillion, golden.get.currentNetDebtMillion);
  assert.equal(response.defaults.dilutedSharesMillion, golden.get.dilutedSharesMillion);
  const configuration = getForecastCompanyAdapter("GPOR").configuration;
  assert.equal(configuration.balanceSheet.netDebtMillion, golden.get.currentNetDebtMillion);
  assert.equal(configuration.hedges.status, "unavailable");
  for (const year of golden.get.forecastYears) {
    assert.equal(response.result.annual[year].production.totalMcfe, golden.get.totalMcfe[year]);
  }
});

test("GPOR guidance mapping: production is already Bcfe/d, and capexTotalMillion is the base operated program only, excluding the discretionary acreage program", () => {
  const production = guidanceTypes.findGuidance(gporGuidance.gporManagementGuidance, "totalProductionBcfePerDay", "2026");
  assert.ok(Math.abs(production.midpoint - 1.0425) < 1e-9);
  const capex = guidanceTypes.findGuidance(gporGuidance.gporManagementGuidance, "capexTotalMillion", "2026");
  assert.equal(capex.midpoint, 430);
  assert.equal(gporGuidance.gporGuidedDiscretionaryAcreageCapexMillion(), 140);
});

test("GPOR's guided combined liquids volume and %-of-WTI NGL realization are read correctly", () => {
  assert.equal(gporGuidance.gporGuidedLiquidsMbblPerDay(), 19.5);
  assert.ok(Math.abs(gporGuidance.gporGuidedNglRealizationPctOfWti() - 0.45) < 1e-9);
});

test("GPOR's derived production-tax guidance entry reconciles to its documented formula", () => {
  const productionTax = guidanceTypes.findGuidance(gporGuidance.gporManagementGuidance, "productionTaxPerMcfe", "2026");
  assert.ok(Math.abs(productionTax.midpoint - 0.08 / 2.9856) < 1e-9);
});

test("GPOR's default forecast excludes the discretionary acreage capex and discloses it via a warning", () => {
  const response = getCompanyForecast("GPOR");
  assert.ok(response.warnings.some((w) => w.includes("$140mm") && w.includes("additional")));
});

test("generic POST matches the captured GPOR default forecast", () => {
  const result = runCompanyForecast("GPOR", baseBody()).result;
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
  test(`golden GPOR scenario: ${name}`, () => {
    const body = baseBody(fixture.request);
    if (fixture.request.valuation) body.valuation = fixture.request.valuation;
    const result = runCompanyForecast("GPOR", body).result;
    if (fixture.ebitdax2027Million) assert.equal(result.annual["2027"].ebitdaxMillion, fixture.ebitdax2027Million);
    if (fixture.ebitdax2028Million) assert.equal(result.annual["2028"].ebitdaxMillion, fixture.ebitdax2028Million);
    if (fixture.forwardEbitdaxMillion) assert.equal(result.valuation.forwardEbitdaxMillion, fixture.forwardEbitdaxMillion);
    assert.equal(result.valuation.impliedSharePrice, fixture.impliedSharePrice);
  });
}

test("GPOR capex override lets a user model the combined base + discretionary acreage program", () => {
  const combined = runCompanyForecast("GPOR", baseBody({ capex: { "2026": { totalMillion: 570 } } })).result;
  const base = runCompanyForecast("GPOR", baseBody()).result;
  assert.ok(combined.annual["2026"].capexMillion > base.annual["2026"].capexMillion);
  assert.equal(combined.annual["2026"].capexMillion, 570);
});

test("reset/default after GPOR overrides has no state leakage", () => {
  const before = runCompanyForecast("GPOR", baseBody()).result;
  runCompanyForecast("GPOR", baseBody(golden.post.productionOverride.request));
  const reset = runCompanyForecast("GPOR", baseBody()).result;
  assert.deepEqual(reset, before);
});

test("GPOR sparse overrides carry field-level provenance without relabeling untouched fields", () => {
  const response = runCompanyForecast("GPOR", baseBody({
    production: { "2027": { gasMmcfPerDay: 1000 } },
    customCommodity: { henryHubPerMmbtu: 5 }
  }));
  assert.equal(response.fieldProvenance["production.2027.gasMmcfPerDay"], "user_override");
  assert.equal(response.fieldProvenance["production.2027.nglMbblPerDay"], "derived_guidance");
  assert.equal(response.fieldProvenance["commodity.henryHubPerMmbtu"], "user_override");
  assert.equal(response.fieldProvenance["commodity.wtiPerBbl"], "model");
  assert.equal(response.fieldProvenance["costs.2026.loePerMcfe"], "management_guidance");
  assert.equal(response.fieldProvenance["costs.2026.productionTaxPctRevenue"], undefined);
});

test("GPOR, EXE, and RRC forecasts are isolated from each other", () => {
  const rrcBefore = getCompanyForecast("RRC").result;
  const exeBefore = getCompanyForecast("EXE").result;
  runCompanyForecast("GPOR", baseBody(golden.post.commodityOverride.request));
  assert.deepEqual(getCompanyForecast("RRC").result, rrcBefore);
  assert.deepEqual(getCompanyForecast("EXE").result, exeBefore);
});

test("malformed GPOR requests fail instead of silently defaulting", () => {
  assert.throws(() => runCompanyForecast("GPOR", { production: { "2027": { gasMmcfPerDay: "not-a-number" } } }), /finite number/);
  assert.throws(() => runCompanyForecast("GPOR", { production: { "2029": { gasMmcfPerDay: 1000 } } }), /outside the active forecast window/);
  assert.throws(() => runCompanyForecast("GPOR", { valuation: { forwardYear: "2029" } }), /forwardYear/);
});

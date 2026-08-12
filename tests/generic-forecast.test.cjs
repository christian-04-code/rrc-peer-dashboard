const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const golden = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/rrc-forecast-golden.json"), "utf8"));
const { getCompanyForecast, runCompanyForecast } = load("lib/forecast/api.ts");
const { getRrcLegacyDefaults, runRrcLegacyForecast } = load("lib/forecast/companies/rrc.ts");
const { getForecastCompanyAdapter } = load("lib/forecast/companies/index.ts");
const { buildForecastYearWindow, parseQuarter } = load("lib/forecast/periods.ts");
const forecastRoute = load("app/api/forecast/route.ts");

function baseBody(extra = {}) {
  return {
    strategy: "maintenance",
    production: {},
    costs: {},
    capex: {},
    pricing: {},
    commodityMode: "current-market",
    valuation: { targetEvToEbitdax: 5.5, forwardYear: "2027" },
    ...extra
  };
}

test("generic GET exposes typed company metadata, dynamic periods, provenance, and exact RRC defaults", () => {
  const response = getCompanyForecast("RRC");
  const legacy = getRrcLegacyDefaults();
  assert.equal(response.company.ticker, "RRC");
  assert.deepEqual(response.company.periods.forecastYears, golden.get.forecastYears);
  assert.equal(response.company.periods.latestActualPeriod, golden.get.latestActualPeriod);
  assert.equal(response.company.periods.latestDetailedActualPeriod, "2026Q1");
  assert.deepEqual(response.provenanceClasses, ["actual", "management_guidance", "derived_guidance", "market", "model", "user_override"]);
  assert.equal(response.defaults.currentNetDebtMillion, golden.get.currentNetDebtMillion);
  assert.equal(response.defaults.dilutedSharesMillion, golden.get.dilutedSharesMillion);
  assert.deepEqual(response.result, legacy.result);
  const configuration = getForecastCompanyAdapter("RRC").configuration;
  assert.equal(configuration.balanceSheet.netDebtMillion, golden.get.currentNetDebtMillion);
  assert.deepEqual(configuration.valuationPresets, { bear: 4.5, base: 5.5, bull: 6.5 });
  for (const year of golden.get.forecastYears) {
    assert.equal(response.defaults.productionDefaults[year].value, golden.get.productionBcfePerDay[year]);
    assert.ok(response.defaults.productionDefaults[year].provenance);
  }
});

test("public generic route returns its documented success and failure statuses", async () => {
  const get = await forecastRoute.GET(new Request("http://localhost/api/forecast?company=RRC"));
  assert.equal(get.status, 200);
  assert.equal((await get.json()).company.ticker, "RRC");

  const unknown = await forecastRoute.GET(new Request("http://localhost/api/forecast?company=NOPE"));
  assert.equal(unknown.status, 404);
  const malformed = await forecastRoute.POST(new Request("http://localhost/api/forecast?company=RRC", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ production: { "2027": { gasMmcfPerDay: "not-a-number" } } })
  }));
  assert.equal(malformed.status, 400);
});

test("generic POST and compatibility wrapper preserve the captured default response", () => {
  const genericResponse = runCompanyForecast("RRC", baseBody());
  const generic = genericResponse.result;
  const legacy = runRrcLegacyForecast(baseBody()).result;
  assert.deepEqual(generic, legacy);
  for (const year of golden.get.forecastYears) {
    assert.equal(generic.annual[year].ebitdaxMillion, golden.post.default.ebitdaxMillion[year]);
    assert.equal(generic.annual[year].freeCashFlowMillion, golden.post.default.freeCashFlowMillion[year]);
  }
  assert.equal(generic.valuation.impliedSharePrice, golden.post.default.impliedSharePrice);
  assert.equal(genericResponse.fieldProvenance["reportedPeriods.through"], "actual");
  assert.equal(genericResponse.fieldProvenance["production.2026.totalBcfePerDay"], "management_guidance");
  assert.equal(genericResponse.fieldProvenance["production.2026.gasMmcfPerDay"], "derived_guidance");
  assert.equal(genericResponse.fieldProvenance["production.2027.totalBcfePerDay"], "management_guidance");
  assert.equal(genericResponse.fieldProvenance["costs.2027.cashTaxRate"], "model");
});

for (const [name, fixture] of Object.entries({
  productionOverride: golden.post.productionOverride,
  commodityOverride: golden.post.commodityOverride,
  multipleSparseOverrides: golden.post.multipleSparseOverrides,
  valuationMultiple: golden.post.valuationMultiple,
  forwardYear: golden.post.forwardYear
})) {
  test(`golden RRC scenario: ${name}`, () => {
    const body = baseBody(fixture.request);
    if (fixture.request.valuation) body.valuation = fixture.request.valuation;
    const result = runCompanyForecast("RRC", body).result;
    if (fixture.ebitdax2027Million) assert.equal(result.annual["2027"].ebitdaxMillion, fixture.ebitdax2027Million);
    if (fixture.ebitdax2028Million) assert.equal(result.annual["2028"].ebitdaxMillion, fixture.ebitdax2028Million);
    if (fixture.forwardEbitdaxMillion) assert.equal(result.valuation.forwardEbitdaxMillion, fixture.forwardEbitdaxMillion);
    assert.equal(result.valuation.impliedSharePrice, fixture.impliedSharePrice);
  });
}

test("reset/default after overrides has no state leakage", () => {
  const before = runCompanyForecast("RRC", baseBody()).result;
  runCompanyForecast("RRC", baseBody(golden.post.productionOverride.request));
  const reset = runCompanyForecast("RRC", baseBody()).result;
  assert.deepEqual(reset, before);
});

test("sparse overrides carry field-level provenance without relabeling untouched fields", () => {
  const response = runCompanyForecast("RRC", baseBody({
    production: { "2027": { gasMmcfPerDay: 1900 } },
    customCommodity: { henryHubPerMmbtu: 5 }
  }));
  assert.equal(response.fieldProvenance["production.2027.gasMmcfPerDay"], "user_override");
  assert.equal(response.fieldProvenance["production.2027.nglMbblPerDay"], "management_guidance");
  assert.equal(response.fieldProvenance["commodity.henryHubPerMmbtu"], "user_override");
  assert.equal(response.fieldProvenance["commodity.wtiPerBbl"], "model");
});

test("unsupported and unknown tickers are explicit and isolated from RRC", () => {
  const rrcBefore = getCompanyForecast("RRC");
  const ar = getCompanyForecast("AR");
  assert.equal(ar.company.supported, false);
  assert.equal(ar.result, null);
  assert.equal(ar.defaults, null);
  assert.match(ar.warnings[0], /does not yet/);
  assert.throws(() => runCompanyForecast("AR", {}), (error) => error.status === 422);
  assert.throws(() => getCompanyForecast("NOPE"), (error) => error.status === 404);
  assert.deepEqual(getCompanyForecast("RRC").result, rrcBefore.result);
});

test("company switching clears incompatible workbench state before the next response", () => {
  const workbench = fs.readFileSync(path.join(process.cwd(), "components/forecast/RrcScenarioWorkbench.tsx"), "utf8");
  const panel = fs.readFileSync(path.join(process.cwd(), "components/dashboard/ForecastWorkspacePanel.tsx"), "utf8");
  assert.match(workbench, /setDefaults\(null\)[\s\S]*setDefaultResult\(null\)[\s\S]*setCustomResult\(null\)[\s\S]*setCustomActive\(false\)/);
  assert.match(workbench, /\/api\/forecast\?company=/);
  assert.match(workbench, /\}, \[company\]\);/);
  assert.match(panel, /key=\{ticker\}/);
});

test("malformed values, invalid enums, and out-of-window years fail instead of silently defaulting", () => {
  assert.throws(() => runCompanyForecast("RRC", { production: { "2027": { gasMmcfPerDay: "1900" } } }), /finite number/);
  assert.throws(() => runCompanyForecast("RRC", { production: { "2029": { gasMmcfPerDay: 1900 } } }), /outside the active forecast window/);
  assert.throws(() => runCompanyForecast("RRC", { strategy: "guess" }), /strategy/);
  assert.throws(() => runCompanyForecast("RRC", { valuation: { forwardYear: "2029" } }), /forwardYear/);
});

test("dynamic forecast windows keep the current year for Q1-Q3 and start next year after Q4", () => {
  for (const quarter of [1, 2, 3]) {
    assert.deepEqual(buildForecastYearWindow(`2031Q${quarter}`), ["2031", "2032", "2033"]);
  }
  assert.deepEqual(buildForecastYearWindow("2031Q4"), ["2032", "2033", "2034"]);
  assert.deepEqual(parseQuarter("2026Q2"), { year: 2026, quarter: 2 });
  assert.throws(() => buildForecastYearWindow("2026Q5"), /Invalid quarterly period/);
});

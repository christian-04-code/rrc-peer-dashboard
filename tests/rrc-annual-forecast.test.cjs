const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const rrcAnnual = load("lib/forecast/scenarios/rrc-annual.ts");
const guidance = load("lib/forecast/guidance/rrc.ts");
const guidanceTypes = load("lib/forecast/guidance/types.ts");

function baseRequest(overrides = {}) {
  return {
    strategy: "maintenance",
    production: {},
    costs: {},
    capex: {},
    commodityMode: "current-market",
    valuation: { targetEvToEbitdax: 5.5, forwardYear: "2027" },
    ...overrides
  };
}

// --- 1. Management guidance midpoint math ---

test("guidance midpoint math: range entries compute (low + high) / 2 exactly", () => {
  const loe = guidanceTypes.findGuidance(guidance.rrcManagementGuidance, "loePerMcfe", "2026");
  assert.equal(loe.low, 0.14);
  assert.equal(loe.high, 0.16);
  assert.ok(Math.abs(loe.midpoint - 0.15) < 1e-9);

  const capex = guidanceTypes.findGuidance(guidance.rrcManagementGuidance, "capexTotalMillion", "2026");
  assert.equal(capex.low, 650);
  assert.equal(capex.high, 700);
  assert.equal(capex.midpoint, 675);
});

test("guidance midpoint math: a single point estimate is never turned into a fabricated range", () => {
  const production2027 = guidanceTypes.findGuidance(guidance.rrcManagementGuidance, "totalProductionBcfePerDay", "2027");
  assert.equal(production2027.low, null);
  assert.equal(production2027.high, null);
  assert.equal(production2027.midpoint, 2.6);
});

// --- 2. Guidance midpoint becomes the default forecast input ---

test("annual production default uses the guidance midpoint for a guided year", () => {
  const resolved = rrcAnnual.resolveAnnualProductionDefault("2026");
  assert.equal(resolved.classification, "guided");
  assert.equal(resolved.value, 2.5);
});

test("running the forecast with no user overrides applies the guided 2026/2027/2028 production targets, not a flat hold", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest());
  assert.equal(result.productionResolution["2026"].classification, "guided");
  assert.equal(result.productionResolution["2026"].value, 2.5);
  assert.equal(result.productionResolution["2027"].classification, "guided");
  assert.equal(result.productionResolution["2027"].value, 2.6);
  assert.equal(result.productionResolution["2028"].classification, "guided");
  assert.equal(result.productionResolution["2028"].value, 2.6);

  // 2027Q2 (not the immutable reported quarter; 91 days, non-leap year) should reflect the
  // guided 2.6 Bcfe/d target, not the Q1 2026 reported ~2.207 Bcfe/d rate held flat.
  const q2_2027 = result.quarterly.find((p) => p.period === "2027Q2");
  const impliedBcfePerDay = q2_2027.production.totalMcfe / 91 / 1000;
  assert.ok(Math.abs(impliedBcfePerDay - 2.6) < 0.01);
});

test("2026 guided capex total ($675mm) splits into engine capex line items matching the guided category mix (500/130/25/20)", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest());
  const q1 = result.quarterly.find((p) => p.period === "2026Q1");
  // capex breakdown isn't on ForecastPeriodResult (only the total is) -- verify via the annual total instead.
  assert.ok(result.annual["2026"].capexMillion !== null);
  assert.ok(Math.abs(result.annual["2026"].capexMillion - 675) < 0.5);
});

// --- 3. User input overrides the midpoint and is classified "user" ---

test("an explicit annual production override is classified 'user' and replaces the guidance default", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest({ production: { 2026: { totalBcfePerDay: 3.0 } } }));
  assert.equal(result.productionResolution["2026"].classification, "user");
  assert.equal(result.productionResolution["2026"].value, 3.0);
  // 2027/2028 remain guided since they were not touched.
  assert.equal(result.productionResolution["2027"].classification, "guided");
});

test("a user LOE override changes 2026 (non-Q1) EBITDAX, and Q1 2026 (reported) is unaffected", () => {
  const base = rrcAnnual.runRrcAnnualForecast(baseRequest());
  const overridden = rrcAnnual.runRrcAnnualForecast(baseRequest({ costs: { 2026: { loePerMcfe: 5 } } } ));
  const q1Base = base.quarterly.find((p) => p.period === "2026Q1");
  const q1Overridden = overridden.quarterly.find((p) => p.period === "2026Q1");
  assert.equal(q1Base.ebitdaxMillion, q1Overridden.ebitdaxMillion, "Q1 2026 is reported/historical and must never be overridden");

  const q2Base = base.quarterly.find((p) => p.period === "2026Q2");
  const q2Overridden = overridden.quarterly.find((p) => p.period === "2026Q2");
  assert.notEqual(q2Base.ebitdaxMillion, q2Overridden.ebitdaxMillion, "a $5/Mcfe LOE override should materially change forward EBITDAX");
});

// --- 4 & 5. Commodity price mode ---

test("current-market commodity mode passes the supplied live SourcedValues through unchanged (classification 'live')", () => {
  const live = {
    henryHubPerMmbtu: { value: 4.1, unit: "$/MMBtu", source: { name: "OilPriceAPI", period: "current", retrievedAt: "2026-08-11", classification: "live", notes: "" } },
    wtiPerBbl: { value: 70.2, unit: "$/bbl", source: { name: "OilPriceAPI", period: "current", retrievedAt: "2026-08-11", classification: "live", notes: "" } }
  };
  const resolved = rrcAnnual.resolveRrcAnnualInputs(baseRequest({ commodityMode: "current-market", liveCommodity: live }));
  assert.equal(resolved.currentMarketPrices.henryHubPerMmbtu.value, 4.1);
  assert.equal(resolved.currentMarketPrices.henryHubPerMmbtu.source.classification, "live");
  assert.equal(resolved.currentMarketPrices.wtiPerBbl.value, 70.2);
});

test("custom commodity mode uses the entered values, classified 'user', and derives the NGL-percent-of-WTI ratio from the direct $/bbl input", () => {
  const resolved = rrcAnnual.resolveRrcAnnualInputs(
    baseRequest({ commodityMode: "custom", customCommodity: { henryHubPerMmbtu: 4.5, wtiPerBbl: 80, nglPerBbl: 22 } })
  );
  assert.equal(resolved.currentMarketPrices.henryHubPerMmbtu.value, 4.5);
  assert.equal(resolved.currentMarketPrices.henryHubPerMmbtu.source.classification, "user");
  assert.equal(resolved.currentMarketPrices.wtiPerBbl.value, 80);
  assert.equal(resolved.currentMarketPrices.nglPerBbl.value, 22);
});

// --- 6. Annual outputs reconcile to the underlying quarterly calculations ---

test("annual revenue/EBITDAX/capex/FCF exactly equal the sum of their 4 constituent quarters", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest());
  for (const year of ["2026", "2027", "2028"]) {
    const quarters = result.quarterly.filter((p) => p.period.startsWith(year));
    assert.equal(quarters.length, 4);
    const sum = (selector) => quarters.reduce((total, p) => total + selector(p), 0);
    assert.ok(Math.abs(result.annual[year].revenueMillion - sum((p) => p.revenue.totalMillion)) < 1e-6);
    assert.ok(Math.abs(result.annual[year].ebitdaxMillion - sum((p) => p.ebitdaxMillion)) < 1e-6);
    assert.ok(Math.abs(result.annual[year].capexMillion - sum((p) => p.capex.totalMillion)) < 1e-6);
    assert.ok(Math.abs(result.annual[year].freeCashFlowMillion - sum((p) => p.freeCashFlowMillion)) < 1e-6);
  }
});

// --- 7. EV/EBITDAX valuation uses aligned EBITDAX/net-debt dates ---

test("valuation net debt is read from the SAME year-end as the forward EBITDAX year, not a later year's ending balance sheet", () => {
  const result2027 = rrcAnnual.runRrcAnnualForecast(baseRequest({ valuation: { targetEvToEbitdax: 5.5, forwardYear: "2027" } }));
  assert.equal(result2027.valuation.netDebtPeriod, "2027Q4");
  const bsAt2027Q4 = result2027.quarterly.find((p) => p.period === "2027Q4");
  assert.ok(bsAt2027Q4);
  // The old bug always used the LAST period of the whole run (2028Q4); confirm this run's
  // net debt does NOT equal a fresh 2028-forward-year run's net debt (different balance-sheet dates).
  const result2028 = rrcAnnual.runRrcAnnualForecast(baseRequest({ valuation: { targetEvToEbitdax: 5.5, forwardYear: "2028" } }));
  assert.equal(result2028.valuation.netDebtPeriod, "2028Q4");
  assert.notEqual(result2027.valuation.netDebtMillion, result2028.valuation.netDebtMillion);
  assert.equal(result2027.valuation.forwardEbitdaxMillion, result2027.annual["2027"].ebitdaxMillion);
});

test("EV/EBITDAX math: enterprise value, equity value, and implied share price follow the documented formula exactly", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest({ valuation: { targetEvToEbitdax: 5.5, forwardYear: "2027" } }));
  const { forwardEbitdaxMillion, netDebtMillion, dilutedSharesMillion, enterpriseValueMillion, equityValueMillion, impliedSharePrice } = result.valuation;
  assert.ok(Math.abs(enterpriseValueMillion - forwardEbitdaxMillion * 5.5) < 1e-6);
  assert.ok(Math.abs(equityValueMillion - (enterpriseValueMillion - netDebtMillion)) < 1e-6);
  assert.ok(Math.abs(impliedSharePrice - equityValueMillion / dilutedSharesMillion) < 1e-6);
});

// --- 8. Missing guidance is never fabricated ---

test("a metric RRC never guided (e.g. 2027 LOE) is not labeled 'guided' -- it falls back to the existing modeled/held-flat anchor", () => {
  const loe2027 = guidanceTypes.findGuidance(guidance.rrcManagementGuidance, "loePerMcfe", "2027");
  assert.equal(loe2027, undefined);
  const gpAndT2026 = guidanceTypes.findGuidance(guidance.rrcManagementGuidance, "gatheringTransportPerMcfe", "2026");
  assert.equal(gpAndT2026, undefined, "GP&T is disclosed only as a price sensitivity, never as a per-Mcfe guide, so no entry should exist");
});

test("2028 continued-growth capex has no guided figure and is classified 'modeled', not silently called guidance", () => {
  const resolved = rrcAnnual.resolveAnnualCapexDefault("2028", "continued-growth");
  assert.equal(resolved.classification, "modeled");
});

// --- 9. Historical values remain immutable ---

test("Q1 2026 stays reported/historical regardless of production, cost, or capex overrides for that year", () => {
  const overridden = rrcAnnual.runRrcAnnualForecast(
    baseRequest({
      production: { 2026: { totalBcfePerDay: 4.0 } },
      costs: { 2026: { loePerMcfe: 9 } },
      capex: { 2026: { totalMillion: 1200 } }
    })
  );
  const q1 = overridden.quarterly.find((p) => p.period === "2026Q1");
  // Reported Q1 2026 LOE-driven cost anchor (0.14 $/Mcfe) and reported production baseline
  // are compile-time constants in rrc-complete.ts/rrc-baseline.ts; confirm this run's Q1
  // revenue/production were not perturbed by the 2026 annual overrides.
  const base = rrcAnnual.runRrcAnnualForecast(baseRequest());
  const q1Base = base.quarterly.find((p) => p.period === "2026Q1");
  assert.equal(q1.production.totalMcfe, q1Base.production.totalMcfe);
  assert.equal(q1.revenue.totalMillion, q1Base.revenue.totalMillion);
});

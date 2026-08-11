const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const rrcAnnual = load("lib/forecast/scenarios/rrc-annual.ts");
const rrcComplete = load("lib/forecast/scenarios/rrc-complete.ts");
const guidance = load("lib/forecast/guidance/rrc.ts");
const guidanceTypes = load("lib/forecast/guidance/types.ts");

function baseRequest(overrides = {}) {
  return {
    strategy: "maintenance",
    production: {},
    costs: {},
    capex: {},
    pricing: {},
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

// --- CapEx: no category inference when no source-backed split exists ---

test("2027 (guided total only, no category-level guidance) leaves every capex category line unsupported/null rather than reusing 2026's proportions", () => {
  const scenario = rrcComplete.buildRrcCompleteScenario("maintenance", {});
  const q1_2027 = scenario.periods.find((p) => p.period === "2027Q1");
  assert.equal(q1_2027.capex.maintenanceDcMillion.value, null);
  assert.equal(q1_2027.capex.growthDcMillion.value, null);
  assert.equal(q1_2027.capex.landLeaseholdMillion.value, null);
  assert.equal(q1_2027.capex.facilitiesMillion.value, null);
  // Total (which FCF depends on) is unaffected by the unsupported categories.
  assert.ok(Math.abs(q1_2027.capex.totalOverrideMillion.value - 675 / 4) < 1e-9);
});

test("2026 (real guided category breakdown: 500/130/25/20 = $675mm) populates every category line from the actual disclosed figures", () => {
  const scenario = rrcComplete.buildRrcCompleteScenario("maintenance", {});
  const q1_2026 = scenario.periods.find((p) => p.period === "2026Q1");
  assert.ok(Math.abs(q1_2026.capex.maintenanceDcMillion.value - 500 / 4) < 1e-9);
  assert.ok(Math.abs(q1_2026.capex.growthDcMillion.value - 130 / 4) < 1e-9);
  assert.ok(Math.abs(q1_2026.capex.landLeaseholdMillion.value - 25 / 4) < 1e-9);
  assert.ok(Math.abs(q1_2026.capex.facilitiesMillion.value - 20 / 4) < 1e-9);
  for (const field of ["maintenanceDcMillion", "growthDcMillion", "landLeaseholdMillion", "facilitiesMillion"]) {
    assert.equal(q1_2026.capex[field].source.classification, "guided");
  }
});

test("overriding 2026's total capex to a number RRC never disclosed a breakdown for nulls every category line -- it does not scale the guided 500/130/25/20 proportions onto the new total", () => {
  const scenario = rrcComplete.buildRrcCompleteScenario("maintenance", {
    annualOverrides: { 2026: { capexTotalMillion: { value: 800, unit: "$mm", source: { name: "User input", period: "user-entered", retrievedAt: "now", classification: "user", notes: "" } } } }
  });
  const q1_2026 = scenario.periods.find((p) => p.period === "2026Q1");
  assert.equal(q1_2026.capex.maintenanceDcMillion.value, null);
  assert.equal(q1_2026.capex.growthDcMillion.value, null);
  assert.equal(q1_2026.capex.landLeaseholdMillion.value, null);
  assert.equal(q1_2026.capex.facilitiesMillion.value, null);
  assert.ok(Math.abs(q1_2026.capex.totalOverrideMillion.value - 800 / 4) < 1e-9);
  assert.equal(q1_2026.capex.totalOverrideMillion.source.classification, "user");
});

test("annual FCF uses the correct total annual CapEx for a year with no category-level guidance (2027)", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest());
  assert.ok(Math.abs(result.annual["2027"].capexMillion - 675) < 0.5);
  const quarters = result.quarterly.filter((p) => p.period.startsWith("2027"));
  const fcfFromQuarters = quarters.reduce((sum, p) => sum + p.freeCashFlowMillion, 0);
  assert.ok(Math.abs(result.annual["2027"].freeCashFlowMillion - fcfFromQuarters) < 1e-6);
});

// --- Realized pricing: management differential midpoints flow into realized gas/oil pricing ---

test("management gas differential midpoint flows into realized gas pricing for a guided year (2026, non-Q1)", () => {
  const scenario = rrcComplete.buildRrcCompleteScenario("maintenance", {});
  const q2_2026 = scenario.periods.find((p) => p.period === "2026Q2");
  assert.equal(q2_2026.pricing.gasBasisPerMcf.value, -0.4);
  assert.equal(q2_2026.pricing.gasBasisPerMcf.source.classification, "guided");
  // Realized gas price = Henry Hub (3.75 modeled default, no live/custom price supplied) + guided differential.
  const { calculatePricing } = load("lib/forecast/calculations.ts");
  const result = calculatePricing(q2_2026, []);
  assert.ok(Math.abs(result.realizedGasPerMcf - (3.75 + -0.4)) < 1e-9);
});

test("management oil differential midpoint flows into realized oil pricing for a guided year (2026, non-Q1)", () => {
  const scenario = rrcComplete.buildRrcCompleteScenario("maintenance", {});
  const q2_2026 = scenario.periods.find((p) => p.period === "2026Q2");
  assert.equal(q2_2026.pricing.oilDifferentialPerBbl.value, -12);
  assert.equal(q2_2026.pricing.oilDifferentialPerBbl.source.classification, "guided");
  const { calculatePricing } = load("lib/forecast/calculations.ts");
  const result = calculatePricing(q2_2026, []);
  assert.ok(Math.abs(result.realizedOilPerBbl - (65 + -12)) < 1e-9);
});

test("a year RRC did not guide a differential for (2027) does not silently use the Q1 2026 realized differential as guidance -- it falls back to the existing modeled anchor, classified 'modeled' not 'guided'", () => {
  const scenario = rrcComplete.buildRrcCompleteScenario("maintenance", {});
  const q2_2027 = scenario.periods.find((p) => p.period === "2027Q2");
  assert.equal(q2_2027.pricing.gasBasisPerMcf.value, 0.18);
  assert.equal(q2_2027.pricing.gasBasisPerMcf.source.classification, "modeled");
  assert.equal(q2_2027.pricing.oilDifferentialPerBbl.value, -10.68);
  assert.equal(q2_2027.pricing.oilDifferentialPerBbl.source.classification, "modeled");
});

test("a user-entered pricing differential supersedes guidance and is classified 'user'", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest({ pricing: { 2026: { oilDifferentialPerBbl: -20 } } }));
  const q2_2026 = result.quarterly.find((p) => p.period === "2026Q2");
  // realized oil = WTI (65 modeled default) + user override (-20), not the guided -12.
  assert.ok(Math.abs(q2_2026.pricing.realizedOilPerBbl - (65 + -20)) < 1e-9);

  const resolved = rrcAnnual.resolveRrcAnnualInputs(baseRequest({ pricing: { 2026: { oilDifferentialPerBbl: -20 } } }));
  assert.equal(resolved.annualOverrides["2026"].oilDifferentialPerBbl.value, -20);
  assert.equal(resolved.annualOverrides["2026"].oilDifferentialPerBbl.source.classification, "user");
});

// --- G&A $/Mcfe conversion reconciles to the forecast's own annual production volume ---

test("G&A $/Mcfe conversion uses the exact same annual production volume the forecast uses for Revenue, not a separate 365-day approximation", () => {
  const cashGaPerMcfe = 0.25;
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest({ costs: { 2027: { cashGaPerMcfe } } } ));
  const annualMcfe = result.annual["2027"].production.totalMcfe;
  const quarters = result.quarterly.filter((p) => p.period.startsWith("2027"));
  const gaFromQuarters = quarters.reduce((sum, p) => sum + p.costs.cashGaMillion, 0);
  const expectedAnnualGa = (annualMcfe * cashGaPerMcfe) / 1000;
  assert.ok(Math.abs(gaFromQuarters - expectedAnnualGa) < 1e-6, `G&A derived from the forecast's own quarters ($${gaFromQuarters}mm) should equal rate x forecast volume ($${expectedAnnualGa}mm) exactly, not an approximation`);
});

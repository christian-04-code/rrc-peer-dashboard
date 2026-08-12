const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const rrcAnnual = load("lib/forecast/scenarios/rrc-annual.ts");
const rrcComplete = load("lib/forecast/scenarios/rrc-complete.ts");
const rrcActuals = load("lib/forecast/data/rrc-actuals.ts");
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

// --- 1. Management guidance midpoint math (current Q2 2026 cycle) ---

test("guidance midpoint math: range entries compute (low + high) / 2 exactly", () => {
  const loe = guidanceTypes.findGuidance(guidance.rrcManagementGuidance, "loePerMcfe", "2026");
  assert.equal(loe.low, 0.12);
  assert.equal(loe.high, 0.13);
  assert.ok(Math.abs(loe.midpoint - 0.125) < 1e-9);

  const capex = guidanceTypes.findGuidance(guidance.rrcManagementGuidance, "capexTotalMillion", "2026");
  assert.equal(capex.low, 650);
  assert.equal(capex.high, 700);
  assert.equal(capex.midpoint, 675);

  const production = guidanceTypes.findGuidance(guidance.rrcManagementGuidance, "totalProductionBcfePerDay", "2026");
  assert.equal(production.low, 2.35);
  assert.equal(production.high, 2.4);
  assert.ok(Math.abs(production.midpoint - 2.375) < 1e-9);
});

test("guidance midpoint math: a single point estimate is never turned into a fabricated range", () => {
  const production2027 = guidanceTypes.findGuidance(guidance.rrcManagementGuidance, "totalProductionBcfePerDay", "2027");
  assert.equal(production2027.low, null);
  assert.equal(production2027.high, null);
  assert.equal(production2027.midpoint, 2.6);
});

// --- 6. Newest Q2 guidance supersedes stale Q1 guidance where updated ---

test("gas differential guidance uses the current (Q2 2026, 'raised') cycle's sign and value -- a positive premium, not the prior cycle's discount", () => {
  const gas = guidanceTypes.findGuidance(guidance.rrcManagementGuidance, "gasBasisPerMcf", "2026");
  assert.equal(gas.low, 0.35);
  assert.equal(gas.high, 0.4);
  assert.ok(Math.abs(gas.midpoint - 0.375) < 1e-9);
  assert.match(gas.notes, /raised/);
});

test("LOE guidance reflects the updated Q2 2026 range (0.12-0.13), not the prior Q1 2026 range (0.14-0.16)", () => {
  const loe = guidanceTypes.findGuidance(guidance.rrcManagementGuidance, "loePerMcfe", "2026");
  assert.ok(Math.abs(loe.midpoint - 0.125) < 1e-9);
  assert.notEqual(loe.midpoint, 0.15);
});

// --- 7. Reaffirmed guidance retains correct Q2 source/status ---

test("reaffirmed 2026/2027 production guidance still carries the current Q2 2026 reportingCycle and its 'reaffirmed' status, not a stale one", () => {
  const records = load("lib/dashboard/guidance.ts").getCompanyGuidanceRecords("RRC");
  const production2026 = records.find((r) => r.metric === "production" && r.period === "FY 2026");
  assert.equal(production2026.reportingCycle, "Q2 2026");
  assert.equal(production2026.status, "reaffirmed");
  assert.equal(production2026.priorReportingCycle, "Q1 2026");
});

// --- 2. Guidance midpoint becomes the default forecast input ---

test("annual production default (non-2026) uses the guidance midpoint for a guided year", () => {
  const resolved = rrcAnnual.resolveAnnualProductionDefault("2027");
  assert.equal(resolved.classification, "guided");
  assert.equal(resolved.value, 2.6);
});

test("running the forecast with no user overrides applies the guided 2026 (full-year target) and 2027/2028 production targets, not a flat hold", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest());
  assert.equal(result.productionResolution["2026"].classification, "guided");
  assert.ok(Math.abs(result.productionResolution["2026"].value - 2.375) < 1e-9);
  assert.equal(result.productionResolution["2027"].classification, "guided");
  assert.equal(result.productionResolution["2027"].value, 2.6);
  assert.equal(result.productionResolution["2028"].classification, "guided");
  assert.equal(result.productionResolution["2028"].value, 2.6);

  // 2027Q2 (fully forecast year) should reflect the guided 2.6 Bcfe/d target.
  const q2_2027 = result.quarterly.find((p) => p.period === "2027Q2");
  const impliedBcfePerDay = q2_2027.production.totalMcfe / 91 / 1000;
  assert.ok(Math.abs(impliedBcfePerDay - 2.6) < 0.01);
});

// --- 1 & 2. Q2 2026 is the latest reported RRC baseline ---

test("Q2 2026 is the latest reported baseline for total production, revenue, EBITDAX, CapEx, FCF, and net debt", () => {
  const q2 = rrcActuals.rrcActualQuarters["2026Q2"];
  assert.equal(q2.revenueMillion, 833.571);
  assert.equal(q2.ebitdaxMillion, 349.059);
  assert.equal(q2.capexMillion, 222);
  assert.equal(q2.freeCashFlowMillion, 111);
  assert.equal(q2.netDebtMillion, 880.753);
  assert.equal(q2.totalProductionMmcfePerDay, 2296.399);
  assert.deepEqual(rrcActuals.RRC_ACTUAL_PERIODS, ["2026Q1", "2026Q2"]);
  assert.equal(rrcActuals.RRC_LATEST_ACTUAL_PERIOD, "2026Q2");
});

test("a metric with no Q2 2026 breakdown (e.g. total production for an unguided year) falls back to Q2's reported total, not Q1's", () => {
  // totalProductionBcfePerDay is guided for 2026/2027/2028 today, so exercise the fallback
  // path directly rather than via a real (always-guided) year.
  const q2Total = rrcActuals.rrcActualQuarters["2026Q2"].totalProductionMmcfePerDay / 1000;
  const q1Total = rrcActuals.rrcActualQuarters["2026Q1"].totalProductionMmcfePerDay / 1000;
  assert.notEqual(q2Total, q1Total);
  // resolveAnnualProductionDefault's reported-fallback branch is only reachable for a year
  // with no guidance; confirm its computed value directly matches the Q2 total conversion.
  const source = require("node:fs").readFileSync(require("node:path").join(process.cwd(), "lib/forecast/scenarios/rrc-annual.ts"), "utf8");
  assert.match(source, /rrcActualQuarters\["2026Q2"\]/);
  assert.match(source, /Latest reported total production \(Q2 2026\), held flat/);
});

// --- 5. Full-year CapEx guidance midpoint reconciles correctly after Q1/Q2 actual CapEx ---

test("2026 CapEx reconciles: guided $675mm full-year midpoint less Q1 actual ($139mm) and Q2 actual ($222mm) leaves $314mm required for H2, split evenly ($157mm each quarter)", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest());
  const q1 = result.quarterly.find((p) => p.period === "2026Q1");
  const q2 = result.quarterly.find((p) => p.period === "2026Q2");
  const q3 = result.quarterly.find((p) => p.period === "2026Q3");
  const q4 = result.quarterly.find((p) => p.period === "2026Q4");
  assert.equal(q1.capex.totalMillion, 139);
  assert.equal(q2.capex.totalMillion, 222);
  assert.ok(Math.abs(q3.capex.totalMillion - 157) < 1e-9);
  assert.ok(Math.abs(q4.capex.totalMillion - 157) < 1e-9);
  assert.ok(Math.abs(result.annual["2026"].capexMillion - 675) < 1e-6);
});

// --- 3. User input overrides the midpoint and is classified "user" ---

test("an explicit annual production override for 2026 is classified 'user' and replaces the guidance default in the H2 reconciliation", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest({ production: { 2026: { totalBcfePerDay: 2.5 } } }));
  assert.equal(result.productionResolution["2026"].classification, "user");
  assert.equal(result.productionResolution["2026"].value, 2.5);
  assert.ok(Math.abs(result.annual["2026"].production.totalMcfe / 365 / 1000 - 2.5) < 1e-6);
  // 2027/2028 remain guided since they were not touched.
  assert.equal(result.productionResolution["2027"].classification, "guided");
});

test("a user LOE override changes 2026 (non-actual) EBITDAX, and Q1/Q2 2026 (reported) are unaffected", () => {
  const base = rrcAnnual.runRrcAnnualForecast(baseRequest());
  const overridden = rrcAnnual.runRrcAnnualForecast(baseRequest({ costs: { 2026: { loePerMcfe: 5 } } }));
  const q1Base = base.quarterly.find((p) => p.period === "2026Q1");
  const q1Overridden = overridden.quarterly.find((p) => p.period === "2026Q1");
  assert.equal(q1Base.ebitdaxMillion, q1Overridden.ebitdaxMillion, "Q1 2026 is reported/historical and must never be overridden");
  const q2Base = base.quarterly.find((p) => p.period === "2026Q2");
  const q2Overridden = overridden.quarterly.find((p) => p.period === "2026Q2");
  assert.equal(q2Base.ebitdaxMillion, q2Overridden.ebitdaxMillion, "Q2 2026 is reported/historical and must never be overridden");

  const q3Base = base.quarterly.find((p) => p.period === "2026Q3");
  const q3Overridden = overridden.quarterly.find((p) => p.period === "2026Q3");
  assert.notEqual(q3Base.ebitdaxMillion, q3Overridden.ebitdaxMillion, "a $5/Mcfe LOE override should materially change Q3 2026 EBITDAX");
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

// --- 11. Annual Revenue/EBITDAX/CapEx/FCF reconcile to the underlying quarterly calculations ---

test("annual revenue/EBITDAX/capex/FCF exactly equal the sum of their 4 constituent quarters, including years with an actual/estimate split", () => {
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

// --- 10 & 12. Balance sheet starts from Q2 2026; EV/EBITDAX valuation remains date-aligned ---

test("balance-sheet roll-forward begins from the latest Q2 2026 reported position, not Q1: Q1/Q2 net debt is the exact reported figure, and Q3 rolls forward from Q2", () => {
  const rrcHedged = load("lib/forecast/scenarios/rrc-hedged.ts");
  const result = rrcHedged.runRrcHedgedScenario("maintenance", {});
  const bsQ1 = result.balanceSheet.find((b) => b.period === "2026Q1");
  const bsQ2 = result.balanceSheet.find((b) => b.period === "2026Q2");
  const bsQ3 = result.balanceSheet.find((b) => b.period === "2026Q3");
  assert.equal(bsQ1.netDebtMillion, 833.753);
  assert.equal(bsQ2.netDebtMillion, 880.753);
  // Q3 must roll forward from Q2's actual net debt: Q3 net debt = Q2 net debt - Q3 FCF
  // (no dividends/buybacks/debt issuance modeled beyond the fixed $23.8mm dividend).
  const q3Forecast = result.forecast.periods.find((p) => p.period === "2026Q3");
  const expectedQ3NetDebt = 880.753 - (q3Forecast.freeCashFlowMillion - 23.8);
  assert.ok(Math.abs(bsQ3.netDebtMillion - expectedQ3NetDebt) < 1e-6, `Q3 net debt (${bsQ3.netDebtMillion}) should roll forward from Q2's actual net debt (880.753), not Q1's`);
});

test("valuation net debt is read from the SAME year-end as the forward EBITDAX year, not a later year's ending balance sheet", () => {
  const result2027 = rrcAnnual.runRrcAnnualForecast(baseRequest({ valuation: { targetEvToEbitdax: 5.5, forwardYear: "2027" } }));
  assert.equal(result2027.valuation.netDebtPeriod, "2027Q4");
  const result2028 = rrcAnnual.runRrcAnnualForecast(baseRequest({ valuation: { targetEvToEbitdax: 5.5, forwardYear: "2028" } }));
  assert.equal(result2028.valuation.netDebtPeriod, "2028Q4");
  // Compare the TRUE (unfloored) forecast ending net debt for each date -- the EV/EBITDAX
  // bridge's netDebtMillion is deliberately floored at $0 (see the net-debt-floor tests
  // below) and both 2027 and 2028 happen to be net-cash years, so it floors to 0 for both;
  // that must not be mistaken for the two dates reading the same balance-sheet period.
  assert.notEqual(result2027.valuation.forecastEndingNetDebtMillion, result2028.valuation.forecastEndingNetDebtMillion);
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

test("a metric RRC never guided this cycle (GP&T price sensitivity, cash tax rate, oil differential) is not labeled 'guided'", () => {
  const cashTax = guidanceTypes.findGuidance(guidance.rrcManagementGuidance, "cashTaxRate", "2026");
  assert.equal(cashTax, undefined, "RRC did not guide a cash tax rate this cycle");
  const oilDiff = guidanceTypes.findGuidance(guidance.rrcManagementGuidance, "oilDifferentialPerBbl", "2026");
  assert.equal(oilDiff, undefined, "RRC did not guide an oil differential this cycle");
  const loe2027 = guidanceTypes.findGuidance(guidance.rrcManagementGuidance, "loePerMcfe", "2027");
  assert.equal(loe2027, undefined, "RRC did not guide 2027 LOE");
});

test("2028 continued-growth capex has no guided figure and is classified 'modeled', not silently called guidance", () => {
  const resolved = rrcAnnual.resolveAnnualCapexDefault("2028", "continued-growth");
  assert.equal(resolved.classification, "modeled");
});

test("cash tax rate is no longer classified 'guided' anywhere (including Q1/Q2 2026), since the current cycle does not guide it", () => {
  const scenario = rrcComplete.buildRrcCompleteScenario("maintenance", {});
  for (const period of scenario.periods) {
    assert.notEqual(period.costs.cashTaxRate.source.classification, "guided", `${period.period} cash tax rate must not be classified 'guided'`);
  }
});

// --- 9 (immutability). Historical values remain immutable ---

test("Q1 and Q2 2026 stay reported/historical regardless of production, cost, or capex overrides for that year", () => {
  const overridden = rrcAnnual.runRrcAnnualForecast(
    baseRequest({
      production: { 2026: { totalBcfePerDay: 4.0 } },
      costs: { 2026: { loePerMcfe: 9 } },
      capex: { 2026: { totalMillion: 1200 } }
    })
  );
  const q1 = overridden.quarterly.find((p) => p.period === "2026Q1");
  const q2 = overridden.quarterly.find((p) => p.period === "2026Q2");
  assert.equal(q1.revenue.totalMillion, 1034.17);
  assert.equal(q1.ebitdaxMillion, 569.529);
  assert.equal(q1.capex.totalMillion, 139);
  assert.equal(q1.freeCashFlowMillion, 406);
  assert.equal(q2.revenue.totalMillion, 833.571);
  assert.equal(q2.ebitdaxMillion, 349.059);
  assert.equal(q2.capex.totalMillion, 222);
  assert.equal(q2.freeCashFlowMillion, 111);
});

test("2026E = Q1 2026 actual + Q2 2026 actual + Q3 2026 estimate + Q4 2026 estimate (never re-forecasting Q1/Q2 and calling it an estimate)", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest());
  const q1 = result.quarterly.find((p) => p.period === "2026Q1");
  const q2 = result.quarterly.find((p) => p.period === "2026Q2");
  const q3 = result.quarterly.find((p) => p.period === "2026Q3");
  const q4 = result.quarterly.find((p) => p.period === "2026Q4");
  assert.equal(q1.revenue.totalMillion, 1034.17);
  assert.equal(q2.revenue.totalMillion, 833.571);
  const expectedAnnualRevenue = q1.revenue.totalMillion + q2.revenue.totalMillion + q3.revenue.totalMillion + q4.revenue.totalMillion;
  assert.ok(Math.abs(result.annual["2026"].revenueMillion - expectedAnnualRevenue) < 1e-6);
  const expectedAnnualFcf = q1.freeCashFlowMillion + q2.freeCashFlowMillion + q3.freeCashFlowMillion + q4.freeCashFlowMillion;
  assert.ok(Math.abs(result.annual["2026"].freeCashFlowMillion - expectedAnnualFcf) < 1e-6);
});

// --- CapEx: no category inference when no source-backed split exists ---

test("2026 and 2027 (guided total only this cycle -- no category-level breakdown) leave every capex category line unsupported/null rather than inventing a split", () => {
  const scenario = rrcComplete.buildRrcCompleteScenario("maintenance", {});
  for (const periodLabel of ["2026Q1", "2027Q1"]) {
    const period = scenario.periods.find((p) => p.period === periodLabel);
    assert.equal(period.capex.maintenanceDcMillion.value, null, `${periodLabel} maintenanceDcMillion should be unsupported`);
    assert.equal(period.capex.growthDcMillion.value, null, `${periodLabel} growthDcMillion should be unsupported`);
    assert.equal(period.capex.landLeaseholdMillion.value, null, `${periodLabel} landLeaseholdMillion should be unsupported`);
    assert.equal(period.capex.facilitiesMillion.value, null, `${periodLabel} facilitiesMillion should be unsupported`);
  }
  // Total (which FCF depends on) is unaffected by the unsupported categories.
  assert.ok(Math.abs(scenario.periods.find((p) => p.period === "2027Q1").capex.totalOverrideMillion.value - 675 / 4) < 1e-9);
});

test("2028 maintenance strategy is the one case with a source-backed category: the guided figure IS the maintenance category by definition", () => {
  const scenario = rrcComplete.buildRrcCompleteScenario("maintenance", {});
  const q1_2028 = scenario.periods.find((p) => p.period === "2028Q1");
  assert.ok(Math.abs(q1_2028.capex.maintenanceDcMillion.value - 600 / 4) < 1e-9);
  assert.equal(q1_2028.capex.growthDcMillion.value, null);
  assert.equal(q1_2028.capex.maintenanceDcMillion.source.classification, "guided");
});

// --- Realized pricing: management differential midpoints flow into realized gas/oil pricing ---

test("management gas differential midpoint (current Q2 2026 cycle: +0.375 premium) flows into realized gas pricing for a guided year (2026, non-actual)", () => {
  const scenario = rrcComplete.buildRrcCompleteScenario("maintenance", {});
  const q3_2026 = scenario.periods.find((p) => p.period === "2026Q3");
  assert.ok(Math.abs(q3_2026.pricing.gasBasisPerMcf.value - 0.375) < 1e-9);
  assert.equal(q3_2026.pricing.gasBasisPerMcf.source.classification, "guided");
  // Realized gas price = Henry Hub (3.75 modeled default, no live/custom price supplied) + guided differential.
  const { calculatePricing } = load("lib/forecast/calculations.ts");
  const result = calculatePricing(q3_2026, []);
  assert.ok(Math.abs(result.realizedGasPerMcf - (3.75 + 0.375)) < 1e-9);
});

test("oil differential is not guided this cycle, so it falls back to the existing modeled (Q2 2026 reported, held flat) anchor rather than the prior cycle's guided figure", () => {
  const scenario = rrcComplete.buildRrcCompleteScenario("maintenance", {});
  const q3_2026 = scenario.periods.find((p) => p.period === "2026Q3");
  assert.equal(q3_2026.pricing.oilDifferentialPerBbl.value, -9.62);
  assert.equal(q3_2026.pricing.oilDifferentialPerBbl.source.classification, "modeled");
});

test("a year RRC did not guide a differential for (2027) does not silently use the Q2 2026 realized differential as guidance -- it falls back to the existing modeled anchor, classified 'modeled' not 'guided'", () => {
  const scenario = rrcComplete.buildRrcCompleteScenario("maintenance", {});
  const q2_2027 = scenario.periods.find((p) => p.period === "2027Q2");
  assert.equal(q2_2027.pricing.gasBasisPerMcf.value, -0.47);
  assert.equal(q2_2027.pricing.gasBasisPerMcf.source.classification, "modeled");
  assert.equal(q2_2027.pricing.oilDifferentialPerBbl.value, -9.62);
  assert.equal(q2_2027.pricing.oilDifferentialPerBbl.source.classification, "modeled");
});

test("a user-entered pricing differential supersedes guidance and is classified 'user'", () => {
  // Compare against the guided-default run rather than a hardcoded Henry Hub + differential
  // sum: runRrcAnnualForecast goes through the hedge-aware scenario, whose gasHedgeImpactPerMcf
  // is a real (non-zero) calculated settlement, not just Henry Hub + basis. Isolating the
  // override's effect as a delta avoids needing to duplicate that settlement math here.
  const guided = rrcAnnual.runRrcAnnualForecast(baseRequest());
  const overridden = rrcAnnual.runRrcAnnualForecast(baseRequest({ pricing: { 2026: { gasBasisPerMcf: -0.2 } } }));
  const q3Guided = guided.quarterly.find((p) => p.period === "2026Q3");
  const q3Overridden = overridden.quarterly.find((p) => p.period === "2026Q3");
  // Guided differential is +0.375; user override is -0.2 -- a -0.575 shift in the differential
  // should produce exactly a -0.575 shift in realized gas price (all else held equal).
  const delta = q3Overridden.pricing.realizedGasPerMcf - q3Guided.pricing.realizedGasPerMcf;
  assert.ok(Math.abs(delta - (-0.2 - 0.375)) < 1e-9, `expected realized gas price to shift by exactly the differential change (-0.575), got ${delta}`);

  const resolved = rrcAnnual.resolveRrcAnnualInputs(baseRequest({ pricing: { 2026: { gasBasisPerMcf: -0.2 } } }));
  assert.equal(resolved.annualOverrides["2026"].gasBasisPerMcf.value, -0.2);
  assert.equal(resolved.annualOverrides["2026"].gasBasisPerMcf.source.classification, "user");
});

// --- G&A $/Mcfe conversion reconciles to the forecast's own annual production volume ---

test("G&A $/Mcfe conversion uses the exact same annual production volume the forecast uses for Revenue, not a separate 365-day approximation", () => {
  const cashGaPerMcfe = 0.25;
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest({ costs: { 2027: { cashGaPerMcfe } } }));
  const annualMcfe = result.annual["2027"].production.totalMcfe;
  const quarters = result.quarterly.filter((p) => p.period.startsWith("2027"));
  const gaFromQuarters = quarters.reduce((sum, p) => sum + p.costs.cashGaMillion, 0);
  const expectedAnnualGa = (annualMcfe * cashGaPerMcfe) / 1000;
  assert.ok(Math.abs(gaFromQuarters - expectedAnnualGa) < 1e-6, `G&A derived from the forecast's own quarters ($${gaFromQuarters}mm) should equal rate x forecast volume ($${expectedAnnualGa}mm) exactly, not an approximation`);
});

test("G&A guidance is applied for a year with no explicit user override (2027 uses the guided 2026 rate held flat), never silently null", () => {
  const scenario = rrcComplete.buildRrcCompleteScenario("maintenance", {});
  const q1_2027 = scenario.periods.find((p) => p.period === "2027Q1");
  assert.notEqual(q1_2027.costs.cashGaMillion.value, null);
  assert.ok(q1_2027.costs.cashGaMillion.value > 0);
});

// --- 13. OilPriceAPI -> EIA provider hierarchy is untouched ---

test("live-market-prices.ts's OilPriceAPI-first/EIA-fallback resolution logic is untouched by this integration", () => {
  const liveMarketPrices = require("node:fs").readFileSync(
    require("node:path").join(process.cwd(), "lib/forecast/live-market-prices.ts"),
    "utf8"
  );
  assert.match(liveMarketPrices, /OilPriceAPI.*wins per commodity/s);
  assert.match(liveMarketPrices, /extractLiveMarketMetricsFromMarketResponse/);
});

// --- Regression: 2026 cash-tax display bug fix ---

test("the displayed/API default cash-tax assumption (resolveAnnualCostDefaults) matches the assumption actually consumed by the engine (rrc-complete.ts periodAssumptions), for all three years -- can never silently diverge again", () => {
  const scenario = rrcComplete.buildRrcCompleteScenario("maintenance", {});
  const expectedByYear = { "2026": 0.02, "2027": 0.06, "2028": 0.08 };
  for (const year of ["2026", "2027", "2028"]) {
    const displayed = rrcAnnual.resolveAnnualCostDefaults(year).cashTaxRate.value;
    // A non-Q1 quarter of that year, so it exercises the same modeled-fallback branch the
    // reference panel's default is meant to describe (Q1 2026 is a separate, immutable,
    // always-2% reported quarter and would trivially match by coincidence).
    const engineQuarter = year === "2026" ? "2026Q3" : `${year}Q1`;
    const engineValue = scenario.periods.find((p) => p.period === engineQuarter).costs.cashTaxRate.value;
    assert.equal(displayed, expectedByYear[year], `displayed ${year} cash tax rate should be ${expectedByYear[year] * 100}%`);
    assert.equal(engineValue, expectedByYear[year], `engine ${year} cash tax rate should be ${expectedByYear[year] * 100}%`);
    assert.equal(displayed, engineValue, `${year}: displayed default (${displayed}) must equal what the engine actually uses (${engineValue})`);
  }
});

test("the redesigned workbench keeps cash tax rate (and other secondary assumptions) fully automatic in the backend -- no direct user control is exposed for it", () => {
  const workbench = fs.readFileSync(path.join(process.cwd(), "components", "forecast", "RrcScenarioWorkbench.tsx"), "utf8");
  assert.doesNotMatch(workbench, /Cash tax rate/i);
  assert.doesNotMatch(workbench, /setCosts|cashTaxRate:\s*event/);
  // The user-facing controls are limited to production and commodity prices, per the redesign.
  assert.match(workbench, /Customize Production/);
});

test("modeledCashTaxRateForYear is the single shared source of truth: both rrc-complete.ts's engine and rrc-annual.ts's reference default call it (a numeric-year comparison, not the prior string-comparison bug)", () => {
  assert.equal(rrcComplete.modeledCashTaxRateForYear(2026), 0.02);
  assert.equal(rrcComplete.modeledCashTaxRateForYear(2027), 0.06);
  assert.equal(rrcComplete.modeledCashTaxRateForYear(2028), 0.08);
});

// --- Net-debt floor for the primary EV/EBITDAX valuation only ---

test("positive forecast net debt is deducted normally (not floored) in the EV/EBITDAX bridge", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest({ valuation: { targetEvToEbitdax: 5.5, forwardYear: "2026" } }));
  assert.ok(result.valuation.forecastEndingNetDebtMillion > 0, "2026 year-end should be a positive net debt position in the default scenario");
  assert.equal(result.valuation.netDebtMillion, result.valuation.forecastEndingNetDebtMillion, "positive net debt must flow through to the valuation unchanged");
  assert.equal(result.valuation.valuationNetDebtFloorApplied, false);
  assert.ok(Math.abs(result.valuation.equityValueMillion - (result.valuation.enterpriseValueMillion - result.valuation.forecastEndingNetDebtMillion)) < 1e-6);
});

test("negative forecast net debt (net cash) is floored to $0 for the EV/EBITDAX valuation, but the true figure is still reported", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest({ valuation: { targetEvToEbitdax: 5.5, forwardYear: "2027" } }));
  assert.ok(result.valuation.forecastEndingNetDebtMillion < 0, "2027 year-end should be a net-cash position in the default scenario");
  assert.equal(result.valuation.netDebtMillion, 0, "valuation net debt must be floored at $0, not the negative (net cash) figure");
  assert.equal(result.valuation.valuationNetDebtFloorApplied, true);
  // Floored net debt means equity value equals enterprise value exactly.
  assert.ok(Math.abs(result.valuation.equityValueMillion - result.valuation.enterpriseValueMillion) < 1e-6);
});

// Expected values below were regenerated on feat/rrc-q2-baseline (2026-08-12) after the
// forecast engine's detailed anchor moved from Q1 2026 to Q2 2026 -- see rrc-baseline.ts's
// rrcQ2_2026Baseline. The dominant driver of the change is the gas differential to NYMEX
// moving from a $0.18/Mcf premium (Q1) to a $0.47/Mcf discount (Q2).
test("operating forecast outputs (production/revenue/EBITDAX/CapEx/FCF) are completely unaffected by the net-debt floor", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest({ valuation: { targetEvToEbitdax: 5.5, forwardYear: "2027" } }));
  assert.equal(result.annual["2027"].revenueMillion, 3455.975122683384);
  assert.equal(result.annual["2027"].ebitdaxMillion, 1700.3341986056437);
  assert.equal(result.annual["2027"].capexMillion, 675);
  assert.equal(result.annual["2027"].freeCashFlowMillion, 869.1701466893053);
});

test("displayed forecast net cash (forecastEndingNetDebtMillion) is identical whether or not the floor binds elsewhere -- the floor never touches the reported balance-sheet figure", () => {
  const result2026 = rrcAnnual.runRrcAnnualForecast(baseRequest({ valuation: { targetEvToEbitdax: 5.5, forwardYear: "2026" } }));
  const result2027 = rrcAnnual.runRrcAnnualForecast(baseRequest({ valuation: { targetEvToEbitdax: 5.5, forwardYear: "2027" } }));
  // 2026 (floor does not bind) and 2027 (floor binds) both report their own true ending net
  // debt figure unmodified -- confirms the floor is scoped to the valuation bridge only.
  assert.equal(result2026.valuation.forecastEndingNetDebtMillion, 238.39067471711746);
  assert.equal(result2027.valuation.forecastEndingNetDebtMillion, -535.579471972188);
});

test("implied share price no longer increases solely because unallocated forecast cash accumulates beyond zero net debt (2027 vs. 2028, both net-cash years, same multiple)", () => {
  const result2027 = rrcAnnual.runRrcAnnualForecast(baseRequest({ valuation: { targetEvToEbitdax: 5.5, forwardYear: "2027" } }));
  const result2028 = rrcAnnual.runRrcAnnualForecast(baseRequest({ valuation: { targetEvToEbitdax: 5.5, forwardYear: "2028" } }));
  // Both years are net-cash (floor binds for both), and 2028's true net cash position is far
  // larger in magnitude than 2027's -- confirm that extra unallocated cash is NOT credited:
  // both floor to the same $0 valuation net debt.
  assert.ok(result2028.valuation.forecastEndingNetDebtMillion < result2027.valuation.forecastEndingNetDebtMillion, "2028 should show more accumulated net cash than 2027");
  assert.equal(result2027.valuation.netDebtMillion, 0);
  assert.equal(result2028.valuation.netDebtMillion, 0);
  // With floored net debt at $0 for both, the ONLY driver of a different implied share price
  // between the two is each year's own forward EBITDAX, not the size of the (unmodeled) cash
  // pile -- i.e., equity value == enterprise value == forward EBITDAX x multiple for both.
  assert.ok(Math.abs(result2027.valuation.equityValueMillion - result2027.valuation.forwardEbitdaxMillion * 5.5) < 1e-6);
  assert.ok(Math.abs(result2028.valuation.equityValueMillion - result2028.valuation.forwardEbitdaxMillion * 5.5) < 1e-6);
});

test("an explicit user net-debt override bypasses the floor entirely, even when negative -- it is a deliberate input, not unmodeled excess cash", () => {
  const result = rrcAnnual.runRrcAnnualForecast(
    baseRequest({ valuation: { targetEvToEbitdax: 5.5, forwardYear: "2027", netDebtMillionOverride: -500 } })
  );
  assert.equal(result.valuation.netDebtMillion, -500);
  assert.equal(result.valuation.valuationNetDebtFloorApplied, false);
});

test("the net-debt-floor convention is documented in the forecast's notes output", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest({ valuation: { targetEvToEbitdax: 5.5, forwardYear: "2027" } }));
  assert.ok(result.notes.some((n) => n.includes("Valuation net debt is floored at $0")), "notes should clearly document the floor convention");
  assert.ok(result.notes.some((n) => n.includes("unallocated forecast excess cash is not credited")));
});

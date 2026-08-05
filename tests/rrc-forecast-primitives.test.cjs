const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function load(relativePath) {
  return require(path.join(process.cwd(), relativePath));
}

const calculations = load("lib/forecast/calculations.ts");
const hedges = load("lib/forecast/hedges.ts");
const balanceSheet = load("lib/forecast/balance-sheet.ts");
const valuation = load("lib/forecast/valuation.ts");

function sourced(value, unit = "x") {
  return { value, unit, source: { name: "test", period: "2026Q1", retrievedAt: "2026-08-04", classification: "modeled" } };
}

// --- calculations.ts -------------------------------------------------------

test("calculateProduction converts daily rates to period volumes and totalMcfe", () => {
  const input = Object.freeze({
    period: "2026Q1",
    days: 91,
    production: {
      gasMmcfPerDay: sourced(1508.842),
      nglMbblPerDay: sourced(108.193),
      oilMbblPerDay: sourced(8.239)
    }
  });
  const warnings = [];
  const result = calculations.calculateProduction(input, warnings);
  assert.equal(warnings.length, 0);
  assert.ok(Math.abs(result.gasMmcf - 137304.622) < 0.01);
  assert.ok(Math.abs(result.nglMbbl - 9845.563) < 0.01);
  assert.ok(Math.abs(result.oilMbbl - 749.749) < 0.01);
  // totalMcfe = gasMmcf + (nglMbbl + oilMbbl) * 6, all in the same MMcf-equivalent scale.
  const expectedTotal = result.gasMmcf + (result.nglMbbl + result.oilMbbl) * 6;
  assert.equal(result.totalMcfe, expectedTotal);
});

test("calculateProduction is deterministic and does not mutate its input", () => {
  const input = Object.freeze({
    period: "2026Q1",
    days: 91,
    production: { gasMmcfPerDay: sourced(1000), nglMbblPerDay: sourced(50), oilMbblPerDay: sourced(10) }
  });
  const a = calculations.calculateProduction(input, []);
  const b = calculations.calculateProduction(input, []);
  assert.deepEqual(a, b);
});

test("calculateProduction rejects an invalid day count instead of guessing a volume", () => {
  const warnings = [];
  const result = calculations.calculateProduction(
    { period: "2026Q1", days: 0, production: { gasMmcfPerDay: sourced(1000), nglMbblPerDay: sourced(50), oilMbblPerDay: sourced(10) } },
    warnings
  );
  assert.equal(result.gasMmcf, null);
  assert.equal(result.totalMcfe, null);
  assert.ok(warnings.length > 0);
});

test("calculateProduction preserves null for a missing product rather than treating it as zero", () => {
  const warnings = [];
  const result = calculations.calculateProduction(
    { period: "2026Q1", days: 91, production: { gasMmcfPerDay: sourced(null), nglMbblPerDay: sourced(50), oilMbblPerDay: sourced(10) } },
    warnings
  );
  assert.equal(result.gasMmcf, null);
  assert.notEqual(result.nglMbbl, null);
  assert.equal(result.totalMcfe, null, "total must stay null, not silently drop the missing gas volume");
  assert.ok(warnings.some((w) => w.includes("Gas production")));
});

test("calculateRevenue applies volume x price at consistent scale", () => {
  const production = { gasMmcf: 1000, nglMbbl: 100, oilMbbl: 50, totalMcfe: 1900 };
  const pricing = { realizedGasPerMcf: 4, realizedNglPerBbl: 20, realizedOilPerBbl: 60 };
  const revenue = calculations.calculateRevenue(production, pricing);
  assert.equal(revenue.gasMillion, (1000 * 4) / 1000);
  assert.equal(revenue.nglMillion, (100 * 20) / 1000);
  assert.equal(revenue.oilMillion, (50 * 60) / 1000);
  assert.equal(revenue.totalMillion, revenue.gasMillion + revenue.nglMillion + revenue.oilMillion);
});

test("calculateRevenue keeps a product's revenue null when its price is unavailable", () => {
  const production = { gasMmcf: 1000, nglMbbl: 100, oilMbbl: 50, totalMcfe: 1900 };
  const pricing = { realizedGasPerMcf: null, realizedNglPerBbl: 20, realizedOilPerBbl: 60 };
  const revenue = calculations.calculateRevenue(production, pricing);
  assert.equal(revenue.gasMillion, null);
  assert.equal(revenue.totalMillion, null);
});

test("calculatePricing blends NGL realization as a percent of WTI plus uplift and hedge impact", () => {
  const input = {
    commodity: { henryHubPerMmbtu: sourced(3.5), wtiPerBbl: sourced(65), nglRealizationPctOfWti: sourced(24 / 65) },
    pricing: {
      gasBasisPerMcf: sourced(0.18),
      gasTransportMarketingPerMcf: sourced(0),
      gasHedgeImpactPerMcf: sourced(0),
      nglMarketingUpliftPerBbl: sourced(1),
      nglHedgeImpactPerBbl: sourced(0.5),
      oilDifferentialPerBbl: sourced(-10.68),
      oilHedgeImpactPerBbl: sourced(0)
    }
  };
  const pricing = calculations.calculatePricing(input, []);
  assert.ok(Math.abs(pricing.realizedNglPerBbl - (65 * (24 / 65) + 1 + 0.5)) < 1e-9);
  assert.ok(Math.abs(pricing.realizedGasPerMcf - (3.5 + 0.18 + 0 + 0)) < 1e-9);
});

test("calculateCosts derives LOE and gathering from total production, not revenue", () => {
  const input = {
    costs: {
      loePerMcfe: sourced(0.14),
      gatheringTransportPerMcfe: sourced(1.63),
      productionTaxPctRevenue: sourced(0.01),
      cashGaMillion: sourced(45),
      explorationMillion: sourced(6)
    }
  };
  const production = { gasMmcf: null, nglMbbl: null, oilMbbl: null, totalMcfe: 200000 };
  const revenue = { gasMillion: null, nglMillion: null, oilMillion: null, totalMillion: 1000 };
  const costs = calculations.calculateCosts(input, production, revenue, []);
  assert.equal(costs.loeMillion, (200000 * 0.14) / 1000);
  assert.equal(costs.gatheringTransportMillion, (200000 * 1.63) / 1000);
  assert.equal(costs.productionTaxMillion, 1000 * 0.01);
});

test("calculateCapex sums components but stays null if any component is unavailable (never a silent zero)", () => {
  const complete = {
    capex: {
      maintenanceDcMillion: sourced(100),
      growthDcMillion: sourced(50),
      landLeaseholdMillion: sourced(0),
      facilitiesMillion: sourced(0),
      environmentalMillion: sourced(0),
      otherMillion: sourced(0)
    }
  };
  assert.equal(calculations.calculateCapex(complete, []).totalMillion, 150);

  const missing = { capex: { ...complete.capex, growthDcMillion: sourced(null) } };
  assert.equal(calculations.calculateCapex(missing, []).totalMillion, null);
});

// --- hedges.ts ---------------------------------------------------------

function position(overrides) {
  return {
    id: "p1",
    commodity: "natural_gas",
    instrument: "swap",
    index: "NYMEX Henry Hub",
    startPeriod: "2026-01-01",
    endPeriod: "2026-12-31",
    volume: 1000,
    volumeUnit: "MMBtu",
    source: { name: "test", period: "2026Q1", retrievedAt: "2026-08-04", classification: "modeled" },
    ...overrides
  };
}

test("swap settlement is a gain when the fixed price is above market", () => {
  const result = hedges.calculateHedgeSettlement({ position: position({ instrument: "swap", fixedPrice: 4 }), marketPrice: 3 });
  assert.equal(result.settlement, 1000 * (4 - 3));
});

test("swap settlement is a loss when the fixed price is below market", () => {
  const result = hedges.calculateHedgeSettlement({ position: position({ instrument: "swap", fixedPrice: 3 }), marketPrice: 4 });
  assert.equal(result.settlement, 1000 * (3 - 4));
});

test("collar settlement is zero inside the band", () => {
  const result = hedges.calculateHedgeSettlement({
    position: position({ instrument: "collar", floorPrice: 3, ceilingPrice: 5 }),
    marketPrice: 4
  });
  assert.equal(result.settlement, 0);
});

test("collar settlement pays the floor when the price is below it", () => {
  const result = hedges.calculateHedgeSettlement({
    position: position({ instrument: "collar", floorPrice: 3, ceilingPrice: 5 }),
    marketPrice: 2
  });
  assert.equal(result.settlement, 1000 * (3 - 2));
});

test("collar settlement gives up upside above the ceiling", () => {
  const result = hedges.calculateHedgeSettlement({
    position: position({ instrument: "collar", floorPrice: 3, ceilingPrice: 5 }),
    marketPrice: 6
  });
  assert.equal(result.settlement, 1000 * -(6 - 5));
});

test("three-way collar gives full floor protection between the sold put and the floor", () => {
  const result = hedges.calculateHedgeSettlement({
    position: position({ instrument: "three_way_collar", floorPrice: 4, soldPutPrice: 3, ceilingPrice: 5 }),
    marketPrice: 3.5
  });
  assert.equal(result.settlement, 1000 * (4 - 3.5));
});

test("three-way collar caps downside protection once price falls below the sold put", () => {
  const result = hedges.calculateHedgeSettlement({
    position: position({ instrument: "three_way_collar", floorPrice: 4, soldPutPrice: 3, ceilingPrice: 5 }),
    marketPrice: 2
  });
  // Below the sold put, protection is capped at (floor - soldPut) regardless of how far price falls further.
  assert.equal(result.settlement, 1000 * (4 - 3));
});

test("zero hedge volume settles to zero rather than null", () => {
  const result = hedges.calculateHedgeSettlement({ position: position({ instrument: "swap", fixedPrice: 4, volume: 0 }), marketPrice: 3 });
  assert.equal(result.settlement, 0);
  assert.equal(result.warnings.length, 0);
});

test("negative hedge volume is rejected rather than silently flipping sign", () => {
  const result = hedges.calculateHedgeSettlement({ position: position({ instrument: "swap", fixedPrice: 4, volume: -100 }), marketPrice: 3 });
  assert.equal(result.settlement, null);
  assert.ok(result.warnings.length > 0);
});

test("portfolio settlement sums known positions but goes null if any position is unresolved", () => {
  const ok = hedges.calculateHedgePortfolioSettlement([
    { position: position({ id: "a", fixedPrice: 4 }), marketPrice: 3 },
    { position: position({ id: "b", fixedPrice: 5 }), marketPrice: 3 }
  ]);
  assert.equal(ok.settlement, 1000 * (4 - 3) + 1000 * (5 - 3));

  const partial = hedges.calculateHedgePortfolioSettlement([
    { position: position({ id: "a", fixedPrice: 4 }), marketPrice: 3 },
    { position: position({ id: "b", instrument: "swap", fixedPrice: null }), marketPrice: 3 }
  ]);
  assert.equal(partial.settlement, null, "an unresolved position must not be dropped from the sum silently");
});

// --- balance-sheet.ts ----------------------------------------------------

test("rollForwardBalanceSheet reconciles cash, debt, and net debt for one period", () => {
  const result = balanceSheet.rollForwardBalanceSheet({
    period: "2026Q1",
    beginningCashMillion: 10,
    beginningDebtMillion: 800,
    freeCashFlowMillion: 50,
    dividendsMillion: 20,
    buybacksMillion: 5,
    debtIssuedMillion: 0,
    debtRepaidMillion: 0,
    ebitdaxMillion: 100
  });
  const expectedCash = 10 + 50 - 20 - 5 + 0 - 0;
  assert.equal(result.endingCashMillion, expectedCash);
  assert.equal(result.endingDebtMillion, 800);
  assert.equal(result.netDebtMillion, 800 - expectedCash);
  assert.equal(result.netLeverage, (800 - expectedCash) / (100 * 4));
});

test("rollForwardBalanceSheet never plugs a missing input with zero", () => {
  const result = balanceSheet.rollForwardBalanceSheet({
    period: "2026Q1",
    beginningCashMillion: 10,
    beginningDebtMillion: 800,
    freeCashFlowMillion: null,
    dividendsMillion: 20,
    buybacksMillion: 5,
    debtIssuedMillion: 0,
    debtRepaidMillion: 0,
    ebitdaxMillion: 100
  });
  assert.equal(result.endingCashMillion, null);
  assert.equal(result.netDebtMillion, null);
  assert.ok(result.warnings.some((w) => w.includes("Free cash flow")));
});

test("rollForwardBalanceSheet warns instead of inventing a financing plug when cash goes negative", () => {
  const result = balanceSheet.rollForwardBalanceSheet({
    period: "2026Q1",
    beginningCashMillion: 5,
    beginningDebtMillion: 800,
    freeCashFlowMillion: -50,
    dividendsMillion: 20,
    buybacksMillion: 0,
    debtIssuedMillion: 0,
    debtRepaidMillion: 0,
    ebitdaxMillion: 20
  });
  assert.ok(result.endingCashMillion < 0);
  assert.equal(result.endingDebtMillion, 800, "debt must not silently absorb the shortfall");
  assert.ok(result.warnings.some((w) => w.includes("negative")));
});

// --- valuation.ts ----------------------------------------------------------

test("calculateMultipleValuation bridges EV to equity to per-share value", () => {
  const result = valuation.calculateMultipleValuation({
    forecastEbitdaxMillion: 1000,
    targetEvToEbitdax: 5,
    netDebtMillion: 800,
    dilutedSharesMillion: 250
  });
  assert.equal(result.enterpriseValueMillion, 5000);
  assert.equal(result.equityValueMillion, 4200);
  assert.equal(result.impliedSharePrice, 4200 / 250);
  assert.equal(result.warnings.length, 0);
});

test("calculateMultipleValuation refuses to divide by a zero or negative share count", () => {
  const result = valuation.calculateMultipleValuation({
    forecastEbitdaxMillion: 1000,
    targetEvToEbitdax: 5,
    netDebtMillion: 800,
    dilutedSharesMillion: 0
  });
  assert.equal(result.impliedSharePrice, null);
  assert.equal(result.enterpriseValueMillion, null);
  assert.ok(result.warnings.some((w) => w.includes("Diluted shares")));
});

test("calculateMultipleValuation stays null end-to-end when EBITDAX is unavailable", () => {
  const result = valuation.calculateMultipleValuation({
    forecastEbitdaxMillion: null,
    targetEvToEbitdax: 5,
    netDebtMillion: 800,
    dilutedSharesMillion: 250
  });
  assert.equal(result.enterpriseValueMillion, null);
  assert.equal(result.equityValueMillion, null);
  assert.equal(result.impliedSharePrice, null);
});

test("calculateDcf discounts explicit cash flows and a Gordon-growth terminal value", () => {
  const result = valuation.calculateDcf({
    annualFreeCashFlowMillion: [{ year: 2026, value: 100 }, { year: 2027, value: 110 }],
    discountRate: 0.1,
    terminalGrowthRate: 0.02,
    netDebtMillion: 500,
    dilutedSharesMillion: 100
  });
  const pv1 = 100 / 1.1;
  const pv2 = 110 / 1.1 ** 2;
  const terminal = (110 * 1.02) / (0.1 - 0.02);
  const pvTerminal = terminal / 1.1 ** 2;
  assert.ok(Math.abs(result.presentValueForecastMillion - (pv1 + pv2)) < 1e-9);
  assert.ok(Math.abs(result.terminalValueMillion - terminal) < 1e-9);
  assert.ok(Math.abs(result.enterpriseValueMillion - (pv1 + pv2 + pvTerminal)) < 1e-9);
  assert.ok(Math.abs(result.equityValueMillion - (pv1 + pv2 + pvTerminal - 500)) < 1e-9);
  assert.ok(Math.abs(result.impliedSharePrice - result.equityValueMillion / 100) < 1e-9);
});

test("calculateDcf refuses a terminal value when growth is not below the discount rate", () => {
  const result = valuation.calculateDcf({
    annualFreeCashFlowMillion: [{ year: 2026, value: 100 }],
    discountRate: 0.05,
    terminalGrowthRate: 0.05,
    netDebtMillion: 500,
    dilutedSharesMillion: 100
  });
  assert.equal(result.terminalValueMillion, null);
  assert.equal(result.impliedSharePrice, null);
  assert.ok(result.warnings.some((w) => w.includes("Discount rate must exceed terminal growth rate")));
});

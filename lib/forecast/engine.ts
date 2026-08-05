import {
  calculateCapex,
  calculateCosts,
  calculatePricing,
  calculateProduction,
  calculateRevenue
} from "@/lib/forecast/calculations";
import type {
  ForecastPeriodAssumptions,
  ForecastPeriodResult,
  ForecastScenario,
  ForecastScenarioResult
} from "@/lib/forecast/types";

export const FORECAST_ENGINE_VERSION = "0.1.0";

function validRate(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function runForecastPeriod(input: ForecastPeriodAssumptions): ForecastPeriodResult {
  const warnings: string[] = [];
  const pricing = calculatePricing(input, warnings);
  const production = calculateProduction(input, warnings);
  const revenue = calculateRevenue(production, pricing);
  const costs = calculateCosts(input, production, revenue, warnings);
  const capex = calculateCapex(input, warnings);

  const ebitdaMillion =
    revenue.totalMillion === null || costs.totalCashOperatingMillion === null
      ? null
      : revenue.totalMillion - costs.totalCashOperatingMillion;

  // Exploration expense is included in cash operating costs above. Adding it back
  // produces EBITDAX without silently changing the company's EBITDA definition.
  const ebitdaxMillion =
    ebitdaMillion === null || costs.explorationMillion === null
      ? null
      : ebitdaMillion + costs.explorationMillion;

  const cashInterest = input.costs.cashInterestMillion.value;
  if (cashInterest === null || !Number.isFinite(cashInterest)) {
    warnings.push("Cash interest is unavailable.");
  }

  const cashTaxRate = input.costs.cashTaxRate.value;
  if (!validRate(cashTaxRate)) {
    warnings.push("Cash tax rate is unavailable or outside 0%–100%.");
  }

  const pretaxCashFlow =
    ebitdaxMillion === null || cashInterest === null || !Number.isFinite(cashInterest)
      ? null
      : ebitdaxMillion - cashInterest;
  const cashTaxesMillion =
    pretaxCashFlow === null || !validRate(cashTaxRate)
      ? null
      : Math.max(pretaxCashFlow, 0) * cashTaxRate;
  const operatingCashFlowBeforeWorkingCapitalMillion =
    pretaxCashFlow === null || cashTaxesMillion === null
      ? null
      : pretaxCashFlow - cashTaxesMillion;
  const freeCashFlowMillion =
    operatingCashFlowBeforeWorkingCapitalMillion === null || capex.totalMillion === null
      ? null
      : operatingCashFlowBeforeWorkingCapitalMillion - capex.totalMillion;

  return {
    period: input.period,
    pricing,
    production,
    revenue,
    costs,
    capex,
    ebitdaMillion,
    ebitdaxMillion,
    cashTaxesMillion,
    operatingCashFlowBeforeWorkingCapitalMillion,
    freeCashFlowMillion,
    warnings
  };
}

export function runForecastScenario(scenario: ForecastScenario): ForecastScenarioResult {
  if (scenario.periods.length === 0) {
    throw new Error("Forecast scenario requires at least one period.");
  }
  if (scenario.engineVersion !== FORECAST_ENGINE_VERSION) {
    throw new Error(
      `Scenario engine version ${scenario.engineVersion} does not match ${FORECAST_ENGINE_VERSION}.`
    );
  }

  const periods = scenario.periods.map(runForecastPeriod);
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    engineVersion: FORECAST_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    periods
  };
}

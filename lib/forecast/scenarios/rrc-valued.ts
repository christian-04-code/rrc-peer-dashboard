import { rrcQ1_2026Baseline } from "@/lib/forecast/data/rrc-baseline";
import { runRrcCompleteScenario, type RrcPost2027Strategy } from "@/lib/forecast/scenarios/rrc-complete";
import { calculateDcf, calculateMultipleValuation } from "@/lib/forecast/valuation";

export type RrcValuationAssumptions = {
  targetEvToEbitdax: number;
  discountRate: number;
  terminalGrowthRate: number;
};

export const defaultRrcValuationAssumptions: RrcValuationAssumptions = {
  targetEvToEbitdax: 5.5,
  discountRate: 0.1,
  terminalGrowthRate: 0
};

function sumYear(
  periods: Array<{ period: string; ebitdaxMillion: number | null; freeCashFlowMillion: number | null }>,
  year: number,
  field: "ebitdaxMillion" | "freeCashFlowMillion"
): number | null {
  const values = periods.filter((period) => period.period.startsWith(String(year))).map((period) => period[field]);
  if (values.length !== 4 || values.some((value) => value === null)) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

export function runRrcValuedScenario(
  strategy: RrcPost2027Strategy = "maintenance",
  assumptions: RrcValuationAssumptions = defaultRrcValuationAssumptions
) {
  const complete = runRrcCompleteScenario(strategy);
  const forecastPeriods = complete.forecast.periods;
  const endingBalanceSheet = complete.balanceSheet[complete.balanceSheet.length - 1];
  const dilutedSharesMillion = rrcQ1_2026Baseline.dilutedSharesMillion.value;
  const forecast2027EbitdaxMillion = sumYear(forecastPeriods, 2027, "ebitdaxMillion");
  const netDebtMillion = endingBalanceSheet?.endingNetDebtMillion ?? null;

  const multiple = calculateMultipleValuation({
    forecastEbitdaxMillion: forecast2027EbitdaxMillion,
    targetEvToEbitdax: assumptions.targetEvToEbitdax,
    netDebtMillion,
    dilutedSharesMillion
  });

  const annualFreeCashFlowMillion = [2026, 2027, 2028].map((year) => ({
    year,
    value: sumYear(forecastPeriods, year, "freeCashFlowMillion")
  }));

  const dcf = calculateDcf({
    annualFreeCashFlowMillion,
    discountRate: assumptions.discountRate,
    terminalGrowthRate: assumptions.terminalGrowthRate,
    netDebtMillion,
    dilutedSharesMillion
  });

  return {
    strategy,
    assumptions,
    complete,
    annualFreeCashFlowMillion,
    forecast2027EbitdaxMillion,
    endingNetDebtMillion: netDebtMillion,
    multiple,
    dcf,
    notes: [
      "The target EV/EBITDAX multiple, discount rate, and terminal growth rate are explicit modeled assumptions, not reported company facts.",
      "The valuation uses the deterministic forecast engine and does not substitute a market-price target when an input is unavailable.",
      "DCF is included as a scenario output; for a cyclical E&P company it should be reviewed alongside the multiple method rather than used in isolation."
    ]
  };
}

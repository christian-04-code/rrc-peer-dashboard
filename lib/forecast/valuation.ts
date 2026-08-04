export type MultipleValuationInput = {
  forecastEbitdaxMillion: number | null;
  targetEvToEbitdax: number | null;
  netDebtMillion: number | null;
  dilutedSharesMillion: number | null;
};

export type MultipleValuationResult = {
  enterpriseValueMillion: number | null;
  equityValueMillion: number | null;
  impliedSharePrice: number | null;
  warnings: string[];
};

export type DcfInput = {
  annualFreeCashFlowMillion: Array<{ year: number; value: number | null }>;
  discountRate: number | null;
  terminalGrowthRate: number | null;
  netDebtMillion: number | null;
  dilutedSharesMillion: number | null;
};

export type DcfResult = {
  presentValueForecastMillion: number | null;
  terminalValueMillion: number | null;
  enterpriseValueMillion: number | null;
  equityValueMillion: number | null;
  impliedSharePrice: number | null;
  warnings: string[];
};

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

export function calculateMultipleValuation(input: MultipleValuationInput): MultipleValuationResult {
  const warnings: string[] = [];
  if (!finite(input.forecastEbitdaxMillion) || input.forecastEbitdaxMillion < 0) warnings.push("Forecast EBITDAX is unavailable or invalid.");
  if (!finite(input.targetEvToEbitdax) || input.targetEvToEbitdax <= 0) warnings.push("Target EV/EBITDAX multiple is unavailable or invalid.");
  if (!finite(input.netDebtMillion)) warnings.push("Net debt is unavailable.");
  if (!finite(input.dilutedSharesMillion) || input.dilutedSharesMillion <= 0) warnings.push("Diluted shares are unavailable or invalid.");
  if (warnings.length > 0) return { enterpriseValueMillion: null, equityValueMillion: null, impliedSharePrice: null, warnings };
  const enterpriseValueMillion = input.forecastEbitdaxMillion * input.targetEvToEbitdax;
  const equityValueMillion = enterpriseValueMillion - input.netDebtMillion;
  return { enterpriseValueMillion, equityValueMillion, impliedSharePrice: equityValueMillion / input.dilutedSharesMillion, warnings };
}

export function calculateDcf(input: DcfInput): DcfResult {
  const warnings: string[] = [];
  if (!finite(input.discountRate) || input.discountRate <= 0) warnings.push("Discount rate is unavailable or invalid.");
  if (!finite(input.terminalGrowthRate)) warnings.push("Terminal growth rate is unavailable.");
  if (finite(input.discountRate) && finite(input.terminalGrowthRate) && input.discountRate <= input.terminalGrowthRate) warnings.push("Discount rate must exceed terminal growth rate.");
  if (!finite(input.netDebtMillion)) warnings.push("Net debt is unavailable.");
  if (!finite(input.dilutedSharesMillion) || input.dilutedSharesMillion <= 0) warnings.push("Diluted shares are unavailable or invalid.");
  if (input.annualFreeCashFlowMillion.length === 0) warnings.push("At least one annual free-cash-flow period is required.");
  if (input.annualFreeCashFlowMillion.some((period) => !finite(period.value))) warnings.push("One or more annual free-cash-flow values are unavailable.");
  if (warnings.length > 0) return { presentValueForecastMillion: null, terminalValueMillion: null, enterpriseValueMillion: null, equityValueMillion: null, impliedSharePrice: null, warnings };
  const discountRate = input.discountRate as number;
  const terminalGrowthRate = input.terminalGrowthRate as number;
  const cashFlows = input.annualFreeCashFlowMillion.map((period) => period.value as number);
  const presentValueForecastMillion = cashFlows.reduce((sum, cashFlow, index) => sum + cashFlow / Math.pow(1 + discountRate, index + 1), 0);
  const finalCashFlow = cashFlows[cashFlows.length - 1];
  const terminalValueMillion = (finalCashFlow * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate);
  const presentValueTerminal = terminalValueMillion / Math.pow(1 + discountRate, cashFlows.length);
  const enterpriseValueMillion = presentValueForecastMillion + presentValueTerminal;
  const equityValueMillion = enterpriseValueMillion - (input.netDebtMillion as number);
  return { presentValueForecastMillion, terminalValueMillion, enterpriseValueMillion, equityValueMillion, impliedSharePrice: equityValueMillion / (input.dilutedSharesMillion as number), warnings };
}

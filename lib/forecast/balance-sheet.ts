export type BalanceSheetPeriodInput = {
  period: string;
  beginningCashMillion: number | null;
  beginningDebtMillion: number | null;
  freeCashFlowMillion: number | null;
  dividendsMillion: number | null;
  buybacksMillion: number | null;
  debtIssuedMillion: number | null;
  debtRepaidMillion: number | null;
  ebitdaxMillion: number | null;
};

export type BalanceSheetPeriodResult = {
  period: string;
  endingCashMillion: number | null;
  endingDebtMillion: number | null;
  netDebtMillion: number | null;
  netLeverage: number | null;
  warnings: string[];
};

function valid(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

/**
 * Deterministic quarterly balance-sheet roll-forward.
 *
 * Capital-allocation convention:
 * - Positive free cash flow increases cash.
 * - Dividends and buybacks reduce cash.
 * - Debt issuance increases both cash and debt.
 * - Debt repayment reduces both cash and debt.
 *
 * The function never invents a financing plug. Missing inputs return null.
 */
export function rollForwardBalanceSheet(
  input: BalanceSheetPeriodInput
): BalanceSheetPeriodResult {
  const warnings: string[] = [];
  const required: Array<[number | null, string]> = [
    [input.beginningCashMillion, "Beginning cash"],
    [input.beginningDebtMillion, "Beginning debt"],
    [input.freeCashFlowMillion, "Free cash flow"],
    [input.dividendsMillion, "Dividends"],
    [input.buybacksMillion, "Buybacks"],
    [input.debtIssuedMillion, "Debt issued"],
    [input.debtRepaidMillion, "Debt repaid"]
  ];

  for (const [value, label] of required) {
    if (!valid(value)) warnings.push(`${label} is unavailable for ${input.period}.`);
  }

  if (required.some(([value]) => !valid(value))) {
    return {
      period: input.period,
      endingCashMillion: null,
      endingDebtMillion: null,
      netDebtMillion: null,
      netLeverage: null,
      warnings
    };
  }

  const endingCashMillion =
    input.beginningCashMillion! +
    input.freeCashFlowMillion! -
    input.dividendsMillion! -
    input.buybacksMillion! +
    input.debtIssuedMillion! -
    input.debtRepaidMillion!;
  const endingDebtMillion =
    input.beginningDebtMillion! + input.debtIssuedMillion! - input.debtRepaidMillion!;
  const netDebtMillion = endingDebtMillion - endingCashMillion;
  const netLeverage =
    valid(input.ebitdaxMillion) && input.ebitdaxMillion > 0
      ? netDebtMillion / (input.ebitdaxMillion * 4)
      : null;

  if (endingCashMillion < 0) {
    warnings.push(
      `Ending cash is negative for ${input.period}; the scenario requires an explicit financing action rather than an automatic plug.`
    );
  }
  if (netLeverage === null) {
    warnings.push(`Net leverage is unavailable for ${input.period}.`);
  }

  return {
    period: input.period,
    endingCashMillion,
    endingDebtMillion,
    netDebtMillion,
    netLeverage,
    warnings
  };
}

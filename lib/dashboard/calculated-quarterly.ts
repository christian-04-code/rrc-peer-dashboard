import type { Ticker } from "@/lib/dashboard/types";
import {
  getQuarterlyFinancials,
  quarters,
  type Quarter,
  type SourcedValue
} from "@/lib/dashboard/financials-quarterly";

export function getLtmAdjustedEbitdax(ticker: Ticker, quarter: Quarter): SourcedValue {
  const index = quarters.indexOf(quarter);
  if (index < 3) {
    return unavailable("Four reported quarters are required to calculate LTM Adjusted EBITDAX.");
  }

  const period = quarters.slice(index - 3, index + 1);
  const values = period.map((item) => getQuarterlyFinancials(ticker, item).adjustedEbitdax.value);
  if (values.some((value) => value === null)) {
    return unavailable("LTM Adjusted EBITDAX is unavailable because at least one underlying quarter is blank.");
  }

  return {
    value: (values as number[]).reduce((sum, value) => sum + value, 0),
    source: "codex",
    basis: "derived",
    note: `Calculated as the sum of reported Adjusted EBITDAX for ${period.join(", ")}.`
  };
}

export function getLtmNetIncome(ticker: Ticker, quarter: Quarter): SourcedValue {
  const index = quarters.indexOf(quarter);
  if (index < 3) {
    return unavailable("Four reported quarters are required to calculate LTM net income.");
  }

  const period = quarters.slice(index - 3, index + 1);
  const values = period.map((item) => getQuarterlyFinancials(ticker, item).netIncome?.value ?? null);
  if (values.some((value) => value === null)) {
    return unavailable("LTM net income is unavailable because at least one underlying quarter is blank.");
  }

  return {
    value: (values as number[]).reduce((sum, value) => sum + value, 0),
    source: "factset",
    basis: "derived",
    note: `Calculated as the sum of reported net income for ${period.join(", ")}.`
  };
}

export function getNetDebtToLtmAdjustedEbitdax(ticker: Ticker, quarter: Quarter): SourcedValue {
  const netDebt = getQuarterlyFinancials(ticker, quarter).netDebt;
  const ltmEbitdax = getLtmAdjustedEbitdax(ticker, quarter);

  if (netDebt.value === null) {
    return unavailable("Leverage is unavailable because quarter-end net debt is blank.");
  }
  if (ltmEbitdax.value === null || ltmEbitdax.value === 0) {
    return unavailable("Leverage is unavailable because LTM Adjusted EBITDAX is blank or zero.");
  }

  return {
    value: netDebt.value / ltmEbitdax.value,
    source: "codex",
    basis: "derived",
    note: "Calculated as quarter-end net debt divided by LTM Adjusted EBITDAX. Calculated metric; not company reported."
  };
}

function unavailable(note: string): SourcedValue {
  return { value: null, source: "codex", basis: "derived", note };
}

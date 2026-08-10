import { getQuarterlyFinancials, quarters, type Quarter } from "./financials-quarterly";
import { getLtmNetIncome } from "./calculated-quarterly";
import { getQuarterlyMarketCap } from "./market-cap-quarterly";
import { getQuarterlyEps } from "./eps-quarterly";
import type { Ticker } from "./company-registry";

const latestQuarter = quarters[quarters.length - 1];
const priorYearQuarter = quarters[quarters.length - 1 - 4];

export type ValuationUnit = "$/share" | "$MM" | "x";

export type ValuationMetric = {
  key: "eps" | "ebitdax" | "marketCap" | "pe";
  label: string;
  unit: ValuationUnit;
  current: number | null;
  previous: number | null;
  currentPeriod: Quarter;
  previousPeriod: Quarter;
  note: string;
};

function priceToEarnings(ticker: Ticker, quarter: Quarter): number | null {
  const marketCap = getQuarterlyMarketCap(ticker, quarter)?.value ?? null;
  const ltmNetIncome = getLtmNetIncome(ticker, quarter).value;
  if (marketCap === null || ltmNetIncome === null || ltmNetIncome === 0) return null;
  return marketCap / ltmNetIncome;
}

/** Current (latest reported quarter) vs. previous (same quarter prior year) valuation snapshot for the right-side Valuations widget. Reuses only already-normalized data; unsupported metrics resolve to null and render "--". */
export function getValuationSnapshot(ticker: Ticker): ValuationMetric[] {
  const currentFinancials = getQuarterlyFinancials(ticker, latestQuarter);
  const priorFinancials = getQuarterlyFinancials(ticker, priorYearQuarter);

  return [
    {
      key: "eps",
      label: "EPS",
      unit: "$/share",
      current: getQuarterlyEps(ticker, latestQuarter)?.value ?? null,
      previous: getQuarterlyEps(ticker, priorYearQuarter)?.value ?? null,
      currentPeriod: latestQuarter,
      previousPeriod: priorYearQuarter,
      note: "Standalone-quarter diluted EPS, FactSet E&P model (actual, not estimate)."
    },
    {
      key: "ebitdax",
      label: "EBITDAX",
      unit: "$MM",
      current: currentFinancials.adjustedEbitdax.value,
      previous: priorFinancials.adjustedEbitdax.value,
      currentPeriod: latestQuarter,
      previousPeriod: priorYearQuarter,
      note: "Company-reported Adjusted EBITDAX, standalone quarter."
    },
    {
      key: "marketCap",
      label: "Market Cap",
      unit: "$MM",
      current: getQuarterlyMarketCap(ticker, latestQuarter)?.value ?? null,
      previous: getQuarterlyMarketCap(ticker, priorYearQuarter)?.value ?? null,
      currentPeriod: latestQuarter,
      previousPeriod: priorYearQuarter,
      note: "Quarter-end equity market capitalization."
    },
    {
      key: "pe",
      label: "P/E",
      unit: "x",
      current: priceToEarnings(ticker, latestQuarter),
      previous: priceToEarnings(ticker, priorYearQuarter),
      currentPeriod: latestQuarter,
      previousPeriod: priorYearQuarter,
      note: "Derived: quarter-end market cap divided by trailing-twelve-month net income."
    }
  ];
}

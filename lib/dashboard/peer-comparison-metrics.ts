import { getLtmAdjustedEbitdax, getLtmNetIncome, getNetDebtToLtmAdjustedEbitdax } from "./calculated-quarterly";
import { getQuarterlyEps } from "./eps-quarterly";
import { getQuarterlyFinancials, quarters, type Quarter } from "./financials-quarterly";
import { getQuarterlyFreeCashFlow } from "./free-cash-flow-quarterly";
import { getQuarterlyMarketCap } from "./market-cap-quarterly";
import type { Metric, Ticker } from "./types";

export type PeerMetricKey =
  | "production"
  | "revenue"
  | "ebitdax"
  | "fcf"
  | "capex"
  | "netDebt"
  | "netDebtToEbitdax"
  | "fcfYield"
  | "marketCap"
  | "eps"
  | "pe"
  | "evToEbitdax";

export type PeerMetricCell = { value: number | null; displayValue: string };
export type PeerMetricRow = {
  key: PeerMetricKey;
  label: string;
  unit: string;
  values: Record<Ticker, PeerMetricCell>;
};
export type PeerMetricGroup = { label: string; rows: PeerMetricRow[] };
export type PeerComparisonMatrix = { tickers: Ticker[]; groups: PeerMetricGroup[] };

const latestQuarter = quarters[quarters.length - 1];

export const DEFAULT_PEER_COMPARISON_QUARTER = latestQuarter;

export function getPeerComparisonQuarters(): Quarter[] {
  return [...quarters].reverse();
}

export const chartMetricRow: Record<Metric, PeerMetricKey> = {
  production: "production",
  revenue: "revenue",
  fcf: "fcf",
  capex: "capex",
  debt: "netDebt",
  ebitdax: "ebitdax"
};

export function getActivePeerMetricRow(metric: Metric): PeerMetricKey {
  return chartMetricRow[metric];
}

export function calculateFcfYield(ltmFcf: number | null, marketCap: number | null): number | null {
  if (!finite(ltmFcf) || !finite(marketCap) || marketCap <= 0) return null;
  return ltmFcf / marketCap;
}

export function calculateEvToEbitdax(
  marketCap: number | null,
  netDebt: number | null,
  ltmEbitdax: number | null
): number | null {
  if (!finite(marketCap) || !finite(netDebt) || !finite(ltmEbitdax) || marketCap < 0 || ltmEbitdax <= 0) return null;
  return (marketCap + netDebt) / ltmEbitdax;
}

export function getPeerComparisonMatrix(
  selectedTickers: Ticker[],
  quarter: Quarter = DEFAULT_PEER_COMPARISON_QUARTER
): PeerComparisonMatrix {
  const row = (
    key: PeerMetricKey,
    label: string,
    unit: string,
    read: (ticker: Ticker) => number | null,
    format: (value: number | null) => string
  ): PeerMetricRow => ({
    key,
    label,
    unit,
    values: Object.fromEntries(selectedTickers.map((ticker) => {
      const value = read(ticker);
      return [ticker, { value, displayValue: format(value) }];
    })) as Record<Ticker, PeerMetricCell>
  });

  return {
    tickers: [...selectedTickers],
    groups: [
      {
        label: "Operating",
        rows: [
          row("production", "Production", "MMcfe/d", (ticker) => getQuarterlyFinancials(ticker, quarter).production.total.value, formatNumber),
          row("revenue", "Revenue", "$MM", (ticker) => getQuarterlyFinancials(ticker, quarter).revenue.value, formatMoney),
          row("ebitdax", "Adjusted EBITDAX", "$MM", (ticker) => getQuarterlyFinancials(ticker, quarter).adjustedEbitdax.value, formatMoney),
          row("fcf", "Free Cash Flow", "$MM", (ticker) => getQuarterlyFreeCashFlow(ticker, quarter).value, formatMoney),
          row("capex", "Capital Expenditures", "$MM", (ticker) => getQuarterlyFinancials(ticker, quarter).capitalExpenditures.value, formatMoney)
        ]
      },
      {
        label: "Balance Sheet / Capital",
        rows: [
          row("netDebt", "Net Debt", "$MM", (ticker) => getQuarterlyFinancials(ticker, quarter).netDebt.value, formatMoney),
          row("netDebtToEbitdax", "Net Debt / EBITDAX", "LTM", (ticker) => getNetDebtToLtmAdjustedEbitdax(ticker, quarter).value, formatMultiple),
          row("fcfYield", "FCF Yield", "LTM", (ticker) => {
            const marketCap = getQuarterlyMarketCap(ticker, quarter)?.value ?? null;
            return calculateFcfYield(getLtmFreeCashFlow(ticker, quarter), marketCap);
          }, formatPercent)
        ]
      },
      {
        label: "Valuation",
        rows: [
          row("marketCap", "Market Cap", "$MM", (ticker) => getQuarterlyMarketCap(ticker, quarter)?.value ?? null, formatMoney),
          row("eps", "EPS", "$/share", (ticker) => getQuarterlyEps(ticker, quarter)?.value ?? null, formatPerShare),
          row("pe", "P/E", "LTM", (ticker) => {
            const marketCap = getQuarterlyMarketCap(ticker, quarter)?.value ?? null;
            const netIncome = getLtmNetIncome(ticker, quarter).value;
            return finite(marketCap) && finite(netIncome) && netIncome !== 0 ? marketCap / netIncome : null;
          }, formatMultiple),
          row("evToEbitdax", "EV / EBITDAX", "LTM", (ticker) => calculateEvToEbitdax(
            getQuarterlyMarketCap(ticker, quarter)?.value ?? null,
            getQuarterlyFinancials(ticker, quarter).netDebt.value,
            getLtmAdjustedEbitdax(ticker, quarter).value
          ), formatMultiple)
        ]
      }
    ]
  };
}

function getLtmFreeCashFlow(ticker: Ticker, quarter: Quarter): number | null {
  const index = quarters.indexOf(quarter);
  if (index < 3) return null;
  const values = quarters.slice(index - 3, index + 1).map((period) => getQuarterlyFreeCashFlow(ticker, period).value);
  if (values.some((value) => !finite(value))) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function formatNumber(value: number | null): string {
  return value === null ? "--" : value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatMoney(value: number | null): string {
  return value === null ? "--" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatPerShare(value: number | null): string {
  return value === null ? "--" : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMultiple(value: number | null): string {
  return value === null ? "--" : `${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`;
}

function formatPercent(value: number | null): string {
  return value === null ? "--" : value.toLocaleString("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

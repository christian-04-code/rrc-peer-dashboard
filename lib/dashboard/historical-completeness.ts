import type { Ticker } from "@/lib/dashboard/types";
import {
  financialsQuarterly,
  quarters,
  type QuarterlyFinancials,
  type SourcedValue
} from "@/lib/dashboard/financials-quarterly";
import { getQuarterlyFreeCashFlow } from "@/lib/dashboard/free-cash-flow-quarterly";

export type HistoricalMetricKey =
  | "revenue"
  | "adjustedEbitdax"
  | "freeCashFlow"
  | "capitalExpenditures"
  | "netDebt"
  | "production.total"
  | "production.naturalGas"
  | "production.ngl"
  | "production.oilCondensate"
  | "realizedPrices.naturalGas"
  | "realizedPrices.ngl"
  | "realizedPrices.oilCondensate"
  | "costs.leaseOperatingExpense"
  | "costs.gatheringProcessingTransportation"
  | "costs.cashGA"
  | "costs.totalCashUnitCosts"
  | "wells.drilled"
  | "wells.turnedInLine"
  | "wells.ducInventory";

export type HistoricalCompletenessIssue = {
  ticker: Ticker;
  quarter: string;
  metric: HistoricalMetricKey;
};

export type HistoricalCompletenessSummary = {
  populated: number;
  total: number;
  missing: number;
  coveragePct: number;
  issues: HistoricalCompletenessIssue[];
  byTicker: Record<Ticker, { populated: number; total: number; missing: number; coveragePct: number }>;
};

type MetricReader = {
  key: HistoricalMetricKey;
  read: (row: QuarterlyFinancials, ticker: Ticker, quarter: (typeof quarters)[number]) => SourcedValue | undefined;
};

const metricReaders: MetricReader[] = [
  { key: "revenue", read: (row) => row.revenue },
  { key: "adjustedEbitdax", read: (row) => row.adjustedEbitdax },
  { key: "freeCashFlow", read: (_row, ticker, quarter) => getQuarterlyFreeCashFlow(ticker, quarter) },
  { key: "capitalExpenditures", read: (row) => row.capitalExpenditures },
  { key: "netDebt", read: (row) => row.netDebt },
  { key: "production.total", read: (row) => row.production.total },
  { key: "production.naturalGas", read: (row) => row.production.naturalGas },
  { key: "production.ngl", read: (row) => row.production.ngl },
  { key: "production.oilCondensate", read: (row) => row.production.oilCondensate },
  { key: "realizedPrices.naturalGas", read: (row) => row.realizedPrices.naturalGas },
  { key: "realizedPrices.ngl", read: (row) => row.realizedPrices.ngl },
  { key: "realizedPrices.oilCondensate", read: (row) => row.realizedPrices.oilCondensate },
  { key: "costs.leaseOperatingExpense", read: (row) => row.costs.leaseOperatingExpense },
  { key: "costs.gatheringProcessingTransportation", read: (row) => row.costs.gatheringProcessingTransportation },
  { key: "costs.cashGA", read: (row) => row.costs.cashGA },
  { key: "costs.totalCashUnitCosts", read: (row) => row.costs.totalCashUnitCosts },
  { key: "wells.drilled", read: (row) => row.wells.drilled },
  { key: "wells.turnedInLine", read: (row) => row.wells.turnedInLine },
  { key: "wells.ducInventory", read: (row) => row.wells.ducInventory }
];

export function getHistoricalCompletenessSummary(): HistoricalCompletenessSummary {
  const issues: HistoricalCompletenessIssue[] = [];
  const tickers = Object.keys(financialsQuarterly) as Ticker[];
  const byTicker = {} as HistoricalCompletenessSummary["byTicker"];

  for (const ticker of tickers) {
    let populated = 0;
    const total = quarters.length * metricReaders.length;

    for (const quarter of quarters) {
      const row = financialsQuarterly[ticker][quarter];
      if (!row) throw new Error(`Missing common-quarter financials for ${ticker} ${quarter}`);
      for (const metric of metricReaders) {
        const sourced = metric.read(row, ticker, quarter);
        if (sourced?.value === null || sourced?.value === undefined) {
          issues.push({ ticker, quarter, metric: metric.key });
        } else {
          populated += 1;
        }
      }
    }

    const missing = total - populated;
    byTicker[ticker] = {
      populated,
      total,
      missing,
      coveragePct: total === 0 ? 0 : (populated / total) * 100
    };
  }

  const total = tickers.length * quarters.length * metricReaders.length;
  const missing = issues.length;
  const populated = total - missing;

  return {
    populated,
    total,
    missing,
    coveragePct: total === 0 ? 0 : (populated / total) * 100,
    issues,
    byTicker
  };
}

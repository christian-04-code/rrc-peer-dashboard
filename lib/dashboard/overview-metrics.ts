import { getQuarterlyFinancials, quarters } from "@/lib/dashboard/financials-quarterly";
import { getQuarterlyFreeCashFlow } from "@/lib/dashboard/free-cash-flow-quarterly";
import type { Ticker } from "@/lib/dashboard/types";

const latestQuarter = quarters[quarters.length - 1];
const REPORTED_SOURCE_NOTE = `Latest reported • ${latestQuarter}`;

export type SummaryCard = { key: string; label: string; displayValue: string; note: string };

function formatMillions(value: number | null): string {
  return value === null ? "--" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}MM`;
}

function formatProduction(value: number | null): string {
  return value === null ? "--" : `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} MMcfe/d`;
}

/** Overview summary cards: share price uses the live market-data path (currently no equity feed exists, so it renders "--"); every other card is the latest normalized reported quarter. No forecast, guidance, or mock values. */
export function getOverviewSummaryCards(ticker: Ticker): SummaryCard[] {
  const financials = getQuarterlyFinancials(ticker, latestQuarter);
  const freeCashFlow = getQuarterlyFreeCashFlow(ticker, latestQuarter);

  return [
    { key: "share_price", label: "Share price", displayValue: "--", note: "Live market data" },
    { key: "production", label: "Production", displayValue: formatProduction(financials.production.total.value), note: REPORTED_SOURCE_NOTE },
    { key: "revenue", label: "Revenue", displayValue: formatMillions(financials.revenue.value), note: REPORTED_SOURCE_NOTE },
    { key: "ebitdax", label: "EBITDAX", displayValue: formatMillions(financials.adjustedEbitdax.value), note: REPORTED_SOURCE_NOTE },
    { key: "free_cash_flow", label: "Free cash flow", displayValue: formatMillions(freeCashFlow.value), note: REPORTED_SOURCE_NOTE },
    { key: "net_debt", label: "Net debt", displayValue: formatMillions(financials.netDebt.value), note: REPORTED_SOURCE_NOTE }
  ];
}

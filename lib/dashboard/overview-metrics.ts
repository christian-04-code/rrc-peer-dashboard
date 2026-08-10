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

function formatSharePrice(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type LiveSharePrice = { value: number | null; note: string } | null;

/** Overview summary cards: share price uses the Finnhub current-quote path (see lib/market/use-finnhub-quotes.ts) when a valid live quote is supplied, otherwise renders "--"; every other card is the latest normalized reported quarter. No forecast, guidance, or mock values. */
export function getOverviewSummaryCards(ticker: Ticker, liveSharePrice?: LiveSharePrice): SummaryCard[] {
  const financials = getQuarterlyFinancials(ticker, latestQuarter);
  const freeCashFlow = getQuarterlyFreeCashFlow(ticker, latestQuarter);
  const sharePriceCard: SummaryCard =
    liveSharePrice && liveSharePrice.value !== null
      ? { key: "share_price", label: "Share price", displayValue: formatSharePrice(liveSharePrice.value), note: liveSharePrice.note }
      : { key: "share_price", label: "Share price", displayValue: "--", note: "Finnhub · current market" };

  return [
    sharePriceCard,
    { key: "production", label: "Production", displayValue: formatProduction(financials.production.total.value), note: REPORTED_SOURCE_NOTE },
    { key: "revenue", label: "Revenue", displayValue: formatMillions(financials.revenue.value), note: REPORTED_SOURCE_NOTE },
    { key: "ebitdax", label: "EBITDAX", displayValue: formatMillions(financials.adjustedEbitdax.value), note: REPORTED_SOURCE_NOTE },
    { key: "free_cash_flow", label: "Free cash flow", displayValue: formatMillions(freeCashFlow.value), note: REPORTED_SOURCE_NOTE },
    { key: "net_debt", label: "Net debt", displayValue: formatMillions(financials.netDebt.value), note: REPORTED_SOURCE_NOTE }
  ];
}

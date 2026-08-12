import { getQuarterlyFinancials, quarters, type Quarter, type QuarterlyFinancials } from "@/lib/dashboard/financials-quarterly";
import { getQuarterlyFreeCashFlow } from "@/lib/dashboard/free-cash-flow-quarterly";
import type { Ticker } from "@/lib/dashboard/types";

const peerTickers: Ticker[] = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];
const latestQuarter = quarters[quarters.length - 1];
const REPORTED_SOURCE_NOTE = `Latest reported • ${latestQuarter}`;

export type SummaryCard = { key: string; label: string; displayValue: string; note: string; rank: number | null };

function formatMillions(value: number | null): string {
  return value === null ? "--" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}MM`;
}

function formatProduction(value: number | null): string {
  return value === null ? "--" : `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} MMcfe/d`;
}

function formatSharePrice(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatGasPrice(value: number | null): string {
  return value === null ? "--" : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/Mcf`;
}

function formatMultiple(value: number | null): string {
  return value === null ? "--" : `${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`;
}

function latestComparableQuarter(read: (row: QuarterlyFinancials) => number | null): Quarter | null {
  return [...quarters].reverse().find((quarter) =>
    peerTickers.every((ticker) => read(getQuarterlyFinancials(ticker, quarter)) !== null)
  ) ?? null;
}

function rankValue(ticker: Ticker, values: Partial<Record<Ticker, number | null>>, direction: "high" | "low"): number | null {
  const selected = values[ticker];
  if (selected === null || selected === undefined) return null;
  const comparable = peerTickers
    .map((peerTicker) => values[peerTicker])
    .filter((value): value is number => value !== null && value !== undefined);
  return 1 + comparable.filter((value) => direction === "high" ? value > selected : value < selected).length;
}

function netDebtToEbitdax(row: QuarterlyFinancials): number | null {
  const netDebt = row.netDebt.value;
  const ebitdax = row.adjustedEbitdax.value;
  return netDebt === null || ebitdax === null || ebitdax === 0 ? null : netDebt / ebitdax;
}

export type LiveSharePrice = { value: number | null; note: string } | null;
export type LiveSharePrices = Partial<Record<Ticker, LiveSharePrice>>;

/** Overview summary cards: share price uses the Finnhub current-quote path (see lib/market/use-finnhub-quotes.ts) when a valid live quote is supplied, otherwise renders "--"; every other card is the latest normalized reported quarter. No forecast, guidance, or mock values. */
export function getOverviewSummaryCards(ticker: Ticker, liveSharePrice?: LiveSharePrice, liveSharePrices?: LiveSharePrices): SummaryCard[] {
  const financials = getQuarterlyFinancials(ticker, latestQuarter);
  const freeCashFlow = getQuarterlyFreeCashFlow(ticker, latestQuarter);
  const realizedGasQuarter = latestComparableQuarter((row) => row.realizedPrices.naturalGas.value);
  const realizedGas = realizedGasQuarter === null ? null : getQuarterlyFinancials(ticker, realizedGasQuarter).realizedPrices.naturalGas.value;
  const sharePriceValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, liveSharePrices?.[peerTicker]?.value ?? null])) as Partial<Record<Ticker, number | null>>;
  const productionValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, getQuarterlyFinancials(peerTicker, latestQuarter).production.total.value]));
  const revenueValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, getQuarterlyFinancials(peerTicker, latestQuarter).revenue.value]));
  const ebitdaxValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, getQuarterlyFinancials(peerTicker, latestQuarter).adjustedEbitdax.value]));
  const freeCashFlowValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, getQuarterlyFreeCashFlow(peerTicker, latestQuarter).value]));
  const netDebtValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, getQuarterlyFinancials(peerTicker, latestQuarter).netDebt.value]));
  const capexValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, getQuarterlyFinancials(peerTicker, latestQuarter).capitalExpenditures.value]));
  const realizedGasValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, realizedGasQuarter === null ? null : getQuarterlyFinancials(peerTicker, realizedGasQuarter).realizedPrices.naturalGas.value]));
  const leverageValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, netDebtToEbitdax(getQuarterlyFinancials(peerTicker, latestQuarter))]));
  // No normalized quarterly lateral-feet-TIL actual exists in the repo. Management
  // guidance and average-lateral-length disclosures are intentionally not substituted.
  const lateralFeetTilValues: Partial<Record<Ticker, number | null>> = {};
  const sharePriceCard: SummaryCard =
    liveSharePrice && liveSharePrice.value !== null
      ? { key: "share_price", label: "Share price", displayValue: formatSharePrice(liveSharePrice.value), note: liveSharePrice.note, rank: rankValue(ticker, sharePriceValues, "high") }
      : { key: "share_price", label: "Share price", displayValue: "--", note: "Finnhub · current market", rank: null };

  return [
    sharePriceCard,
    { key: "production", label: "Production", displayValue: formatProduction(financials.production.total.value), note: REPORTED_SOURCE_NOTE, rank: rankValue(ticker, productionValues, "high") },
    { key: "revenue", label: "Revenue", displayValue: formatMillions(financials.revenue.value), note: REPORTED_SOURCE_NOTE, rank: rankValue(ticker, revenueValues, "high") },
    { key: "ebitdax", label: "EBITDAX", displayValue: formatMillions(financials.adjustedEbitdax.value), note: REPORTED_SOURCE_NOTE, rank: rankValue(ticker, ebitdaxValues, "high") },
    { key: "free_cash_flow", label: "Free cash flow", displayValue: formatMillions(freeCashFlow.value), note: REPORTED_SOURCE_NOTE, rank: rankValue(ticker, freeCashFlowValues, "high") },
    { key: "net_debt", label: "Net debt", displayValue: formatMillions(financials.netDebt.value), note: REPORTED_SOURCE_NOTE, rank: rankValue(ticker, netDebtValues, "low") },
    { key: "capex", label: "CapEx", displayValue: formatMillions(financials.capitalExpenditures.value), note: REPORTED_SOURCE_NOTE, rank: rankValue(ticker, capexValues, "high") },
    { key: "realized_gas_price", label: "Realized Natural Gas Price", displayValue: formatGasPrice(realizedGas), note: realizedGasQuarter ? `Latest comparable reported • ${realizedGasQuarter}` : "No comparable reported value", rank: rankValue(ticker, realizedGasValues, "high") },
    { key: "net_debt_to_ebitdax", label: "Net Debt / EBITDAX", displayValue: formatMultiple(netDebtToEbitdax(financials)), note: REPORTED_SOURCE_NOTE, rank: rankValue(ticker, leverageValues, "low") },
    { key: "lateral_feet_til", label: "Lateral Feet TIL", displayValue: "--", note: "No verified reported value", rank: rankValue(ticker, lateralFeetTilValues, "high") }
  ];
}

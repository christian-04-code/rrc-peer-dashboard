import { getQuarterlyFinancials, quarters, type Quarter } from "@/lib/dashboard/financials-quarterly";
import { getQuarterlyFreeCashFlow } from "@/lib/dashboard/free-cash-flow-quarterly";
import { getNetDebtToLtmAdjustedEbitdax, getRealizedPricePerMcfe } from "@/lib/dashboard/calculated-quarterly";
import type { Ticker } from "@/lib/dashboard/types";

const peerTickers: Ticker[] = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];
const latestQuarter = quarters[quarters.length - 1];
const REPORTED_SOURCE_NOTE = `Latest reported • ${latestQuarter}`;

export type SummaryCard = { key: string; label: string; displayValue: string; note: string; rank: number | null; definition?: string };

function formatMillions(value: number | null): string {
  return value === null ? "--" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}MM`;
}

function formatProduction(value: number | null): string {
  return value === null ? "--" : `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} MMcfe/d`;
}

function formatSharePrice(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPerMcfe(value: number | null): string {
  return value === null ? "--" : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/Mcfe`;
}

function formatCount(value: number | null): string {
  return value === null ? "--" : value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatMultiple(value: number | null): string {
  return value === null ? "--" : `${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`;
}

function rankValue(ticker: Ticker, values: Partial<Record<Ticker, number | null>>, direction: "high" | "low"): number | null {
  const selected = values[ticker];
  if (selected === null || selected === undefined) return null;
  const comparable = peerTickers
    .map((peerTicker) => values[peerTicker])
    .filter((value): value is number => value !== null && value !== undefined);
  return 1 + comparable.filter((value) => direction === "high" ? value > selected : value < selected).length;
}

/**
 * Net debt / LTM (trailing four standalone reported quarters) Adjusted EBITDAX.
 * Previously this divided quarter-end net debt by a single quarter's Adjusted
 * EBITDAX, which overstates leverage by roughly 4x versus the LTM convention
 * used everywhere else in the dashboard (see getNetDebtToLtmAdjustedEbitdax in
 * calculated-quarterly.ts, already used by the Peer Comparison Matrix).
 */
function netDebtToLtmEbitdax(ticker: Ticker, quarter: Quarter): number | null {
  return getNetDebtToLtmAdjustedEbitdax(ticker, quarter).value;
}

/**
 * wells.drilled (see financials-quarterly.ts) is disclosed sparsely and
 * inconsistently across peers -- unlike every other Overview card, there is no
 * single quarter where "show Q2 2026 or --" is the right rule, so this walks
 * backward from the latest quarter to the most recent quarter with a verified
 * standalone value for that specific company.
 *
 * Two stored data points are excluded as unverified rather than shown:
 *  - RRC: every populated quarter (Q1-Q3 2025, Q1 2026) carries the exact same
 *    source note used on RRC's null quarters -- "reviewed quarterly materials
 *    do not disclose comparable unique wells drilled by quarter" -- which
 *    directly contradicts having a nonzero value. The stored number cannot be
 *    reconciled against its own documented source, so RRC's Wells Drilled is
 *    treated as unavailable for every quarter until that contradiction is
 *    resolved in the underlying fixture.
 *  - GPOR Q2 2026: the source note quotes GPOR's own 10-Q verbatim -- "We spud
 *    7 gross (6.7 net) wells" -- spud, not drilled. This card does not
 *    substitute wells-spud counts for wells-drilled counts, so this quarter is
 *    skipped in favor of GPOR's last verified drilled disclosure (Q1 2026: 8).
 */
const UNVERIFIED_WELLS_DRILLED: Partial<Record<Ticker, Quarter[] | "all">> = {
  RRC: "all",
  GPOR: ["Q2 2026"]
};

function latestVerifiedWellsDrilled(ticker: Ticker): { quarter: Quarter; value: number } | null {
  const excluded = UNVERIFIED_WELLS_DRILLED[ticker];
  if (excluded === "all") return null;
  const excludedSet = new Set(excluded ?? []);
  for (const quarter of [...quarters].reverse()) {
    if (excludedSet.has(quarter)) continue;
    const value = getQuarterlyFinancials(ticker, quarter).wells.drilled.value;
    if (value !== null) return { quarter, value };
  }
  return null;
}

export type LiveSharePrice = { value: number | null; note: string } | null;
export type LiveSharePrices = Partial<Record<Ticker, LiveSharePrice>>;

/** Overview summary cards: share price uses the Finnhub current-quote path (see lib/market/use-finnhub-quotes.ts) when a valid live quote is supplied, otherwise renders "--"; every other card is the latest normalized reported quarter. No forecast, guidance, or mock values. */
export function getOverviewSummaryCards(ticker: Ticker, liveSharePrice?: LiveSharePrice, liveSharePrices?: LiveSharePrices): SummaryCard[] {
  const financials = getQuarterlyFinancials(ticker, latestQuarter);
  const freeCashFlow = getQuarterlyFreeCashFlow(ticker, latestQuarter);
  const realizedPricePerMcfe = getRealizedPricePerMcfe(ticker, latestQuarter).value;
  const wellsDrilled = latestVerifiedWellsDrilled(ticker);
  const sharePriceValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, liveSharePrices?.[peerTicker]?.value ?? null])) as Partial<Record<Ticker, number | null>>;
  const productionValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, getQuarterlyFinancials(peerTicker, latestQuarter).production.total.value]));
  const revenueValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, getQuarterlyFinancials(peerTicker, latestQuarter).revenue.value]));
  const ebitdaxValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, getQuarterlyFinancials(peerTicker, latestQuarter).adjustedEbitdax.value]));
  const freeCashFlowValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, getQuarterlyFreeCashFlow(peerTicker, latestQuarter).value]));
  const netDebtValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, getQuarterlyFinancials(peerTicker, latestQuarter).netDebt.value]));
  const capexValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, getQuarterlyFinancials(peerTicker, latestQuarter).capitalExpenditures.value]));
  const realizedPricePerMcfeValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, getRealizedPricePerMcfe(peerTicker, latestQuarter).value]));
  const leverageValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, netDebtToLtmEbitdax(peerTicker, latestQuarter)]));
  const wellsDrilledValues = Object.fromEntries(peerTickers.map((peerTicker) => [peerTicker, latestVerifiedWellsDrilled(peerTicker)?.value ?? null]));
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
    {
      key: "realized_price_per_mcfe",
      label: "Realized Price",
      displayValue: formatPerMcfe(realizedPricePerMcfe),
      note: REPORTED_SOURCE_NOTE,
      rank: rankValue(ticker, realizedPricePerMcfeValues, "high"),
      definition: "Blended pre-hedge realized commodity price across gas, NGLs, and oil/condensate per Mcfe of total production."
    },
    { key: "net_debt_to_ebitdax", label: "Net Debt / LTM EBITDAX", displayValue: formatMultiple(netDebtToLtmEbitdax(ticker, latestQuarter)), note: REPORTED_SOURCE_NOTE, rank: rankValue(ticker, leverageValues, "low") },
    {
      key: "wells_drilled",
      label: "Wells Drilled",
      displayValue: formatCount(wellsDrilled?.value ?? null),
      note: wellsDrilled ? `Latest reported • ${wellsDrilled.quarter}` : "No verified reported value",
      rank: rankValue(ticker, wellsDrilledValues, "high"),
      definition: "Gross wells drilled during the standalone quarter shown. Gross/net and operated/total basis is not confirmed for every peer -- do not compare across companies as a strictly like-for-like count."
    }
  ];
}

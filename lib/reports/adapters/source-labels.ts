import type { SourceTag } from "@/lib/dashboard/financials-quarterly";
import type { SourceTag as MarketDataSourceTag } from "@/lib/dashboard/market-cap-quarterly";

/**
 * Human-readable, non-tool-name descriptions of the internal SourceTag
 * values financials-quarterly.ts/market-cap-quarterly.ts carry per cell.
 * Added for the Phase 7 release review's SEC-native-sourcing finding: the
 * weekly report PDF was displaying the raw internal tag "codex" verbatim as
 * a financial-data source, which reads to a reader as a tool/vendor name
 * rather than the actual underlying provenance. Every mapping below states
 * only what that file's own header comment already documents about where
 * the tag's values come from -- nothing here re-derives or re-verifies
 * anything; it is a label translation, not a new sourcing decision.
 */
const FINANCIAL_SOURCE_LABELS: Record<SourceTag, string> = {
  "sec-xbrl": "SEC EDGAR/XBRL company facts API (verified)",
  "sec-direct": "SEC EDGAR filing (Form 10-Q/10-K/8-K, direct extraction)",
  codex: "Company SEC filings & earnings materials (extracted)",
  factset: "FactSet (third-party financial data vendor)"
};

const MARKET_DATA_SOURCE_LABELS: Record<MarketDataSourceTag, string> = {
  macrotrends: "Macrotrends (market data)",
  "yahoo-finance": "Yahoo Finance (market data)",
  "nasdaq-historical": "Nasdaq historical market data"
};

/** For a financial-statement/operating value (financials-quarterly.ts, free-cash-flow-quarterly.ts, calculated-quarterly.ts). */
export function describeFinancialSource(tag: SourceTag): string {
  return FINANCIAL_SOURCE_LABELS[tag] ?? tag;
}

/** For a market-data value (market-cap-quarterly.ts) -- kept distinct from describeFinancialSource so a market price is never presented as if it were filing-sourced financial-statement data. */
export function describeMarketDataSource(tag: MarketDataSourceTag): string {
  return MARKET_DATA_SOURCE_LABELS[tag] ?? tag;
}

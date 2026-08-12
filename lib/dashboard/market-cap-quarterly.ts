/**
 * Quarterly equity market capitalization, standalone quarter-end values, $MM.
 *
 * Source: data/historical.json, normalization_inputs["Equity Market Capitalization"],
 * already-normalized and vetted (Macrotrends historical market cap tables cross-checked
 * against filing share counts for RRC/AR; Yahoo Finance unadjusted close x filing-sourced
 * diluted shares for CNX/CRK/EQT/EXE/GPOR). Reproduced here as a small standalone module
 * (matching the financials-quarterly.ts convention) instead of importing the full
 * multi-megabyte historical.json into the client bundle for one field.
 *
 * Q2 2026 (all 7 tickers): Macrotrends and Yahoo Finance were not programmatically
 * reachable when this quarter was backfilled, so the quarter-end unadjusted close was
 * sourced from Nasdaq's historical trades table instead (same measurement convention:
 * last regular-session trade print on the quarter-end trading day, 2026-06-30), paired
 * with each company's own Q2 2026 Form 10-Q "diluted weighted average shares outstanding"
 * for the three months ended June 30, 2026 (not the six-month YTD figure).
 */

import type { Quarter } from "./financials-quarterly";
import type { Ticker } from "./company-registry";

export type SourceTag = "macrotrends" | "yahoo-finance" | "nasdaq-historical";
export type MarketCapValue = { value: number; source: SourceTag; note: string };

const data: Record<Ticker, Partial<Record<Quarter, MarketCapValue>>> = {
  RRC: {
    "Q1 2024": { value: 8170.0, source: "macrotrends", note: "Macrotrends RRC historical market cap for 2024-03-31 quarter-end: $8.17B; share-count cross-check from 2024_Q1_RRC_10-Q balance sheet/SE." },
    "Q2 2024": { value: 7990.0, source: "macrotrends", note: "Macrotrends RRC historical market cap for 2024-06-30 quarter-end: $7.99B." },
    "Q3 2024": { value: 7340.0, source: "macrotrends", note: "Macrotrends RRC historical market cap for 2024-09-30 quarter-end: $7.34B." },
    "Q4 2024": { value: 8610.0, source: "macrotrends", note: "Macrotrends RRC historical market cap for 2024-12-31 quarter-end: $8.61B." },
    "Q1 2025": { value: 9540.0, source: "macrotrends", note: "Macrotrends RRC historical market cap for 2025-03-31 quarter-end: $9.54B." },
    "Q2 2025": { value: 9650.0, source: "macrotrends", note: "Macrotrends RRC historical market cap for 2025-06-30 quarter-end: $9.65B." },
    "Q3 2025": { value: 8930.0, source: "macrotrends", note: "Macrotrends RRC historical market cap for 2025-09-30 quarter-end: $8.93B." },
    "Q4 2025": { value: 8410.0, source: "macrotrends", note: "Macrotrends RRC historical market cap for 2025-12-31 quarter-end: $8.41B." },
    "Q1 2026": { value: 10650.0, source: "macrotrends", note: "Macrotrends RRC historical market cap for 2026-03-31 quarter-end: $10.65B." },
    "Q2 2026": { value: 8784.65, source: "nasdaq-historical", note: "Nasdaq historical trades table unadjusted close on 2026-06-30 ($37.19) x 236.210mm diluted weighted-average shares for the three months ended June 30, 2026, per the RRC Q2 2026 Form 10-Q." }
  },
  AR: {
    "Q1 2024": { value: 9060.0, source: "macrotrends", note: "Macrotrends AR historical market cap table, dated 2024-03-31." },
    "Q2 2024": { value: 10140.0, source: "macrotrends", note: "Macrotrends AR historical market cap table, dated 2024-06-30." },
    "Q3 2024": { value: 8910.0, source: "macrotrends", note: "Macrotrends AR historical market cap table, dated 2024-09-30." },
    "Q4 2024": { value: 10990.0, source: "macrotrends", note: "Macrotrends AR historical market cap table, dated 2024-12-31." },
    "Q1 2025": { value: 12730.0, source: "macrotrends", note: "Macrotrends AR historical market cap table, dated 2025-03-31." },
    "Q2 2025": { value: 12620.0, source: "macrotrends", note: "Macrotrends AR historical market cap table, dated 2025-06-30." },
    "Q3 2025": { value: 10440.0, source: "macrotrends", note: "Macrotrends AR historical market cap table, dated 2025-09-30." },
    "Q4 2025": { value: 10760.0, source: "macrotrends", note: "Macrotrends AR historical market cap table, dated 2025-12-31." },
    "Q1 2026": { value: 13220.0, source: "macrotrends", note: "Macrotrends AR historical market cap table, dated 2026-03-31." },
    "Q2 2026": { value: 11005.286, source: "nasdaq-historical", note: "Nasdaq historical trades table unadjusted close on 2026-06-30 ($35.14) x 313.184mm diluted weighted-average shares for the three months ended June 30, 2026, per the AR Q2 2026 Form 10-Q." }
  },
  CNX: {
    "Q1 2024": { value: 3635.705, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-03-28 x filing-sourced diluted shares." },
    "Q2 2024": { value: 3682.547, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-06-28 x filing-sourced diluted shares." },
    "Q3 2024": { value: 4861.278, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-09-30 x filing-sourced diluted shares." },
    "Q4 2024": { value: 5459.416, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-12-31 x filing-sourced diluted shares." },
    "Q1 2025": { value: 4579.11, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-03-31 x filing-sourced diluted shares." },
    "Q2 2025": { value: 4779.397, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-06-30 x filing-sourced diluted shares." },
    "Q3 2025": { value: 4364.701, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-09-30 x filing-sourced diluted shares." },
    "Q4 2025": { value: 5243.053, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-12-31 x filing-sourced diluted shares." },
    "Q1 2026": { value: 5471.876, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2026-03-31 x filing-sourced diluted shares." },
    "Q2 2026": { value: 5223.906, source: "nasdaq-historical", note: "Nasdaq historical trades table unadjusted close on 2026-06-30 ($33.93) x 153.961273mm diluted weighted-average shares for the three months ended June 30, 2026, per the CNX Q2 2026 Form 10-Q." }
  },
  CRK: {
    "Q1 2024": { value: 2711.635, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-03-28 x filing-sourced diluted shares." },
    "Q2 2024": { value: 3033.669, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-06-28 x filing-sourced diluted shares." },
    "Q3 2024": { value: 3252.865, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-09-30 x filing-sourced diluted shares." },
    "Q4 2024": { value: 5324.995, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-12-31 x filing-sourced diluted shares." },
    "Q1 2025": { value: 5957.972, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-03-31 x filing-sourced diluted shares." },
    "Q2 2025": { value: 8109.219, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-06-30 x filing-sourced diluted shares." },
    "Q3 2025": { value: 5811.281, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-09-30 x filing-sourced diluted shares." },
    "Q4 2025": { value: 6793.015, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-12-31 x filing-sourced diluted shares." },
    "Q1 2026": { value: 6191.112, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2026-03-31 x filing-sourced diluted shares." },
    "Q2 2026": { value: 4350.851, source: "nasdaq-historical", note: "Nasdaq historical trades table unadjusted close on 2026-06-30 ($14.92) x 291.612mm diluted weighted-average shares for the three months ended June 30, 2026, per the CRK Q2 2026 Form 10-Q." }
  },
  EQT: {
    "Q1 2024": { value: 16369.815, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-03-28 x filing-sourced diluted shares." },
    "Q2 2024": { value: 16330.368, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-06-28 x filing-sourced diluted shares." },
    "Q3 2024": { value: 21862.502, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-09-30 x filing-sourced diluted shares." },
    "Q4 2024": { value: 27548.005, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-12-31 x filing-sourced diluted shares." },
    "Q1 2025": { value: 31984.587, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-03-31 x filing-sourced diluted shares." },
    "Q2 2025": { value: 36395.004, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-06-30 x filing-sourced diluted shares." },
    "Q3 2025": { value: 33967.967, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-09-30 x filing-sourced diluted shares." },
    "Q4 2025": { value: 33461.086, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-12-31 x filing-sourced diluted shares." },
    "Q1 2026": { value: 39805.42, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2026-03-31 x filing-sourced diluted shares." },
    "Q2 2026": { value: 33446.535, source: "nasdaq-historical", note: "Nasdaq historical trades table unadjusted close on 2026-06-30 ($53.17) x 629.049mm diluted weighted-average shares for the three months ended June 30, 2026, per the EQT Q2 2026 Form 10-Q." }
  },
  EXE: {
    "Q1 2024": { value: 11641.035, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-03-28 x filing-sourced diluted shares." },
    "Q2 2024": { value: 10789.505, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-06-28 x filing-sourced diluted shares." },
    "Q3 2024": { value: 19002.612, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-09-30 x filing-sourced diluted shares." },
    "Q4 2024": { value: 23165.279, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-12-31 x filing-sourced diluted shares." },
    "Q1 2025": { value: 26491.871, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-03-31 x filing-sourced diluted shares." },
    "Q2 2025": { value: 27848.755, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-06-30 x filing-sourced diluted shares." },
    "Q3 2025": { value: 25303.149, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-09-30 x filing-sourced diluted shares." },
    "Q4 2025": { value: 26530.352, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-12-31 x filing-sourced diluted shares." },
    "Q1 2026": { value: 26262.543, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2026-03-31 x filing-sourced diluted shares." },
    "Q2 2026": { value: 21735.775, source: "nasdaq-historical", note: "Nasdaq historical trades table unadjusted close on 2026-06-30 ($91.19) x 238.357mm diluted weighted-average shares for the three months ended June 30, 2026, per the EXE Q2 2026 Form 10-Q." }
  },
  GPOR: {
    "Q1 2024": { value: 2901.651, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-03-28 x filing-sourced diluted shares." },
    "Q2 2024": { value: 2734.169, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-06-28 x filing-sourced diluted shares." },
    "Q3 2024": { value: 2683.102, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-09-30 x filing-sourced diluted shares." },
    "Q4 2024": { value: 3296.246, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2024-12-31 x filing-sourced diluted shares." },
    "Q1 2025": { value: 3271.384, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-03-31 x filing-sourced diluted shares." },
    "Q2 2025": { value: 3532.892, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-06-30 x filing-sourced diluted shares." },
    "Q3 2025": { value: 3495.958, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-09-30 x filing-sourced diluted shares." },
    "Q4 2025": { value: 3859.965, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2025-12-31 x filing-sourced diluted shares." },
    "Q1 2026": { value: 3801.837, source: "yahoo-finance", note: "Yahoo Finance unadjusted close on 2026-03-31 x filing-sourced diluted shares." },
    "Q2 2026": { value: 3045.267, source: "nasdaq-historical", note: "Nasdaq historical trades table unadjusted close on 2026-06-30 ($169.70) x 17.945mm diluted weighted-average shares for the three months ended June 30, 2026, per the GPOR Q2 2026 Form 10-Q." }
  }
};

export function getQuarterlyMarketCap(ticker: Ticker, quarter: Quarter): MarketCapValue | undefined {
  return data[ticker]?.[quarter];
}

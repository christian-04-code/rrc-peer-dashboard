import type { Ticker } from "@/lib/dashboard/types";

/**
 * Resolved against FMP's authenticated /stable/commodities-list response
 * (verified 2026-08-10 with the configured production FMP_KEY). Do not
 * substitute guessed alternatives (CL=F, NG=F, WTIUSD-style variants, etc.) --
 * these are the exact symbols FMP's own commodity listing returned.
 */
export const FMP_COMMODITY_SYMBOLS = {
  henryHub: "NGUSD", // FMP commodities-list: { symbol: "NGUSD", name: "Natural Gas" }
  wti: "CLUSD" // FMP commodities-list: { symbol: "CLUSD", name: "Crude Oil" }
} as const;

/** Same 7-core-peer set used throughout the dashboard (see lib/dashboard/company-colors.ts). */
export const FMP_EQUITY_TICKERS: Ticker[] = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];

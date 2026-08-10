import type { Ticker } from "@/lib/dashboard/types";

/**
 * Finnhub owns current share prices only (verified 2026-08-10 against the real
 * production FINNHUB_API_KEY: /quote works for equities; /search returned zero
 * legitimate commodity/futures instruments for WTI/crude oil/natural gas/Henry
 * Hub -- only unrelated equities and ETPs. Commodities stay on EIA; do not add
 * commodity symbols here.
 */
export const FINNHUB_EQUITY_TICKERS: Ticker[] = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];

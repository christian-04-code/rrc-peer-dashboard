/**
 * PHASE 7: enforces the boundary between SEC/company-reported data (this
 * pipeline's job) and market-derived data -- share price, market cap,
 * commodity benchmark prices -- which come from a separate source
 * (lib/dashboard/market-cap-quarterly.ts, currently hand-maintained from
 * macrotrends/yahoo-finance/nasdaq-historical, per lib/sec-pipeline docs
 * captured during PHASE 1 discovery). This module never fabricates a market
 * value; it only reports whether one already exists for the candidate's
 * quarter so the operator knows whether valuation is refreshed or still
 * waiting on market data.
 *
 * `hasMarketCapForQuarter` is injected so callers can pass a real lookup
 * against lib/dashboard/market-cap-quarterly.ts (loaded via the ts-loader in
 * tests, or read as JSON-equivalent data in the CLI) without this module
 * needing to parse TypeScript itself.
 */

export function evaluateMarketDataBoundary({ ticker, quarterKey, hasMarketCapForQuarter, filingComplete }) {
  const marketCapAvailable = Boolean(hasMarketCapForQuarter?.(ticker, quarterKey));

  let status;
  if (!filingComplete) {
    status = "waiting-on-filing-data";
  } else if (marketCapAvailable) {
    status = "complete";
  } else {
    status = "waiting-on-market-data";
  }

  return {
    status,
    filingDataComplete: filingComplete,
    marketDataComplete: marketCapAvailable,
    valuationRefreshed: filingComplete && marketCapAvailable,
    note: marketCapAvailable
      ? `Market cap for ${ticker} ${quarterKey} already present in lib/dashboard/market-cap-quarterly.ts; valuation panels can refresh once filing data is applied.`
      : `No market cap on file for ${ticker} ${quarterKey}. This pipeline does not fetch or estimate share price/market cap -- add it to lib/dashboard/market-cap-quarterly.ts from its existing source (quarter-end close x diluted shares) before valuation panels will reflect this quarter. Recorded as a follow-up, not fabricated.`,
  };
}

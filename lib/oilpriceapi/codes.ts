/**
 * Manually validated against the real production OIL_PRICE_API key (2026-08-10):
 * both codes returned status: success with a current price, currency, unit,
 * data_status, as_of, stale, synthetic, and 24h change. Do not substitute other
 * codes without the same verification.
 */
export const OIL_PRICE_API_CODES = {
  wti: "WTI_USD",
  henryHub: "NATURAL_GAS_USD"
} as const;

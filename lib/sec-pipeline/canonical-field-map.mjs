/**
 * Maps candidate field paths (group.field, matching candidate-schema.mjs) to
 * the two existing canonical stores' own field/metric names, discovered in
 * PHASE 1. The two stores use different naming conventions for the same
 * economic metric (human-readable strings in historical.json vs. camelCase
 * nested fields in financials-quarterly.ts) -- this is the single place that
 * relationship is recorded, so nothing else has to guess at it.
 */

export const CANDIDATE_TO_HISTORICAL_METRIC = Object.freeze({
  "financial.revenue": "Revenue",
  "financial.adjustedEbitdax": "Adjusted EBITDAX",
  "financial.capitalExpenditures": "Capital Expenditures",
  "financial.netDebt": "Net Debt",
  "financial.dilutedShares": "Diluted Weighted-Average Shares (MM)",
  "production.total": "Total Production",
  "production.naturalGas": "Natural Gas Production",
  "production.ngl": "NGL Production",
  "production.oilCondensate": "Oil / Condensate Production",
  "pricing.realizedGas": "Realized Natural Gas Price",
  "pricing.realizedNgl": "Realized NGL Price",
  "pricing.realizedOil": "Realized Oil / Condensate Price",
  "costs.leaseOperatingExpense": "Lease Operating Expense (LOE)",
  "costs.gatheringProcessingTransport": "Gathering / Processing / Transportation",
  "costs.cashGA": "Cash G&A",
  "costs.totalCashUnitCosts": "Total Cash Unit Costs",
  "operating.wellsDrilled": "Wells Drilled",
  "operating.tils": "Wells Turned-in-Line (TIL)",
});

/** financials-quarterly.ts uses the same group/field nesting as the candidate itself, one level deeper for production/pricing/costs/wells. */
export const CANDIDATE_TO_FINANCIALS_QUARTERLY_PATH = Object.freeze({
  "financial.revenue": ["revenue"],
  "financial.adjustedEbitdax": ["adjustedEbitdax"],
  "financial.capitalExpenditures": ["capitalExpenditures"],
  "financial.netDebt": ["netDebt"],
  "production.total": ["production", "total"],
  "production.naturalGas": ["production", "naturalGas"],
  "production.ngl": ["production", "ngl"],
  "production.oilCondensate": ["production", "oilCondensate"],
  "pricing.realizedGas": ["realizedPrices", "naturalGas"],
  "pricing.realizedNgl": ["realizedPrices", "ngl"],
  "pricing.realizedOil": ["realizedPrices", "oilCondensate"],
  "costs.leaseOperatingExpense": ["costs", "leaseOperatingExpense"],
  "costs.gatheringProcessingTransport": ["costs", "gatheringProcessingTransportation"],
  "costs.cashGA": ["costs", "cashGA"],
  "costs.totalCashUnitCosts": ["costs", "totalCashUnitCosts"],
  "operating.wellsDrilled": ["wells", "drilled"],
  "operating.tils": ["wells", "turnedInLine"],
});

export function candidateFieldPath(group, field) {
  return `${group}.${field}`;
}

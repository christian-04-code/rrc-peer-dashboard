/**
 * Adapter over the site's canonical Q1/Q2 2026 reported actuals (lib/dashboard/
 * financials-quarterly.ts + lib/dashboard/free-cash-flow-quarterly.ts, ultimately backed
 * by data/historical.json's audited "Layer 1 - Historical Truth" dataset), reshaped for
 * the forecast engine's period-key convention ("2026Q1"/"2026Q2" instead of "Q1 2026").
 *
 * Historical quarters are immutable reported actuals: revenue, EBITDAX, CapEx, free cash
 * flow, net debt, and total production come directly from this canonical source rather
 * than being reconstructed bottom-up from production x price x cost assumptions (which,
 * even with fully accurate per-unit inputs, does not exactly reconcile to GAAP revenue --
 * e.g. hedge settlements and purchased-gas marketing sales are recognized as revenue but
 * are not part of a simple production x realized-price calculation).
 *
 * Q2 2026's production/pricing/cost BREAKDOWN (gas/NGL/oil split, realized prices, LOE,
 * GP&T, cash G&A) was outside the accepted six-metric Q2 2026 actuals integration scope
 * and is intentionally null in the canonical source -- never fabricated here. Only Q1
 * 2026 carries that level of detail; see rrc-baseline.ts, which remains the "latest fully
 * detailed" anchor used to derive a product mix for forward quarters.
 */

import { getQuarterlyFinancials } from "@/lib/dashboard/financials-quarterly";
import { getQuarterlyFreeCashFlow } from "@/lib/dashboard/free-cash-flow-quarterly";

export type RrcActualPeriod = "2026Q1" | "2026Q2";

export type RrcActualQuarter = {
  period: RrcActualPeriod;
  revenueMillion: number | null;
  ebitdaxMillion: number | null;
  capexMillion: number | null;
  freeCashFlowMillion: number | null;
  netDebtMillion: number | null;
  totalProductionMmcfePerDay: number | null;
  sourceNotes: string;
};

const QUARTER_BY_PERIOD = {
  "2026Q1": "Q1 2026",
  "2026Q2": "Q2 2026"
} as const;

function loadActualQuarter(period: RrcActualPeriod): RrcActualQuarter {
  const quarter = QUARTER_BY_PERIOD[period];
  const financials = getQuarterlyFinancials("RRC", quarter);
  const fcf = getQuarterlyFreeCashFlow("RRC", quarter);
  return {
    period,
    revenueMillion: financials.revenue.value,
    ebitdaxMillion: financials.adjustedEbitdax.value,
    capexMillion: financials.capitalExpenditures.value,
    freeCashFlowMillion: fcf.value,
    netDebtMillion: financials.netDebt.value,
    totalProductionMmcfePerDay: financials.production.total.value,
    sourceNotes: `Reported ${quarter} actual (Codex-normalized Layer 1 Historical Truth). Revenue, EBITDAX, CapEx, free cash flow, net debt, and total production are the company-reported figures for this quarter -- not a bottom-up forecast reconstruction.`
  };
}

/** The two immutable reported quarters as of this integration; extend when a new quarter is audited into the canonical dataset. */
export const RRC_ACTUAL_PERIODS: RrcActualPeriod[] = ["2026Q1", "2026Q2"];
export const RRC_LATEST_ACTUAL_PERIOD: RrcActualPeriod = "2026Q2";
/** Latest quarter with full production-mix/per-unit-cost/realized-price detail. Q2 2026 only carries the six top-line metrics in the current integration scope, so forward per-unit assumptions still derive their product mix from Q1. */
export const RRC_LATEST_DETAILED_ACTUAL_PERIOD: RrcActualPeriod = "2026Q1";

export const rrcActualQuarters: Record<RrcActualPeriod, RrcActualQuarter> = {
  "2026Q1": loadActualQuarter("2026Q1"),
  "2026Q2": loadActualQuarter("2026Q2")
};

export function isRrcActualPeriod(period: string): period is RrcActualPeriod {
  return period === "2026Q1" || period === "2026Q2";
}

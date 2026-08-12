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
 * at the time this file was first written, and was intentionally null in the canonical
 * source -- never fabricated here.
 *
 * UPDATED 2026-08-12 (feat/rrc-q2-baseline): a subsequent Q2 data-foundation pass
 * populated that detail for RRC, and this recalibration independently verified each
 * field against RRC's own Q2 2026 Form 10-Q on the same definitional basis the forecast
 * engine already used for Q1 -- see lib/forecast/data/rrc-baseline.ts's
 * rrcQ2_2026Baseline and rrcLatestDetailedBaseline for the verified values and the
 * field-by-field comparability notes (one field, productionTaxesPerMcfe, was left
 * unresolved for Q2 and still uses the Q1-derived ratio). RRC_LATEST_DETAILED_ACTUAL_PERIOD
 * below now reflects Q2 2026 as the anchor.
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
/** Latest quarter with full production-mix/per-unit-cost/realized-price detail. Moved from 2026Q1 to 2026Q2 on feat/rrc-q2-baseline (2026-08-12) once Q2's detail was verified comparable field-by-field -- see rrc-baseline.ts's rrcLatestDetailedBaseline. */
export const RRC_LATEST_DETAILED_ACTUAL_PERIOD: RrcActualPeriod = "2026Q2";

export const rrcActualQuarters: Record<RrcActualPeriod, RrcActualQuarter> = {
  "2026Q1": loadActualQuarter("2026Q1"),
  "2026Q2": loadActualQuarter("2026Q2")
};

export function isRrcActualPeriod(period: string): period is RrcActualPeriod {
  return period === "2026Q1" || period === "2026Q2";
}

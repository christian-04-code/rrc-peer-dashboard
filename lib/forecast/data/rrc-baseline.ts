import type { AssumptionSource, SourcedValue } from "@/lib/forecast/types";

export type RrcOperatingBaseline = {
  company: "RRC";
  period: string;
  totalProductionBcfePerDay: SourcedValue;
  liquidsPercentOfTotalMcfe: SourcedValue;
  naturalGasMmcfPerDay: SourcedValue;
  nglMbblPerDay: SourcedValue;
  oilMbblPerDay: SourcedValue;
  gasDifferentialToNymexPerMcfIncludingBasisHedges: SourcedValue;
  realizedGasExDerivativesPerMcf: SourcedValue;
  realizedGasIncludingDerivativesPerMcf: SourcedValue;
  realizedNglPerBbl: SourcedValue;
  realizedOilPerBbl: SourcedValue;
  oilDifferentialToWtiPerBbl: SourcedValue;
  directOperatingExpensePerMcfe: SourcedValue;
  gatheringProcessingTransportationPerMcfe: SourcedValue;
  productionTaxesPerMcfe: SourcedValue;
  reportedGaMillion: SourcedValue;
  cashGaMillion: SourcedValue;
  reportedInterestExpenseMillion: SourcedValue;
  cashInterestMillion: SourcedValue;
  balanceSheetNetDebtMillion: SourcedValue;
  dilutedSharesMillion: SourcedValue;
};

const retrievedAt = "2026-08-04T00:00:00.000Z";
const filingReference =
  "Range Resources Corporation Form 10-Q for the quarter ended March 31, 2026";

function source(notes: string): AssumptionSource {
  return {
    name: "Range Resources Q1 2026 Form 10-Q",
    reference: filingReference,
    period: "Q1 2026",
    retrievedAt,
    classification: "reported",
    notes
  };
}

function reported(value: number, unit: string, notes: string): SourcedValue {
  return { value, unit, source: source(notes) };
}

function unavailable(unit: string, notes: string): SourcedValue {
  return { value: null, unit, source: source(notes) };
}

/**
 * Source-backed Q1 2026 operating and financial baseline.
 *
 * Reported values come directly from the Q1 2026 Form 10-Q. Derived values are
 * explicitly identified in their source notes. Cash G&A and cash interest stay
 * unavailable because the filing line items include accrual/non-cash effects and
 * should not be silently treated as cash forecast inputs.
 *
 * Q2 2026 is now the latest reported quarter overall (see lib/forecast/data/
 * rrc-actuals.ts), but the audited Q2 integration only carries six top-line metrics
 * (revenue, EBITDAX, CapEx, free cash flow, net debt, total production) -- not the
 * production mix, per-unit costs, or realized pricing captured here. This Q1 baseline
 * therefore remains the latest FULLY DETAILED reported anchor: forward quarters still
 * derive their gas/NGL/oil product mix from Q1 (the latest quarter that discloses it),
 * scaled to whatever total production level is actually in effect for that period.
 */
export const rrcQ1_2026Baseline: RrcOperatingBaseline = {
  company: "RRC",
  period: "2026-Q1",
  totalProductionBcfePerDay: reported(
    2.207436,
    "Bcfe/d",
    "Average daily total production reported as 2,207,436 Mcfe/d."
  ),
  liquidsPercentOfTotalMcfe: reported(
    0.316517,
    "% of total Mcfe",
    "Derived from reported NGL and oil volumes converted at 6 Mcfe per barrel, divided by reported total Mcfe. Stored as a decimal."
  ),
  naturalGasMmcfPerDay: reported(
    1508.842,
    "MMcf/d",
    "Average daily natural gas production reported as 1,508,842 Mcf/d."
  ),
  nglMbblPerDay: reported(
    108.193,
    "Mbbl/d",
    "Average daily NGL production reported as 108,193 bbl/d."
  ),
  oilMbblPerDay: reported(
    8.239,
    "Mbbl/d",
    "Average daily oil production reported as 8,239 bbl/d."
  ),
  gasDifferentialToNymexPerMcfIncludingBasisHedges: reported(
    0.18,
    "$/Mcf",
    "Derived from the reported $0.21/Mcf average differential above NYMEX plus a $0.03/Mcf realized loss on basis hedging."
  ),
  realizedGasExDerivativesPerMcf: reported(
    5.18,
    "$/Mcf",
    "Reported average realized natural gas price excluding derivative settlements and third-party transportation costs."
  ),
  realizedGasIncludingDerivativesPerMcf: reported(
    4.85,
    "$/Mcf",
    "Reported average realized natural gas price including derivative settlements but before third-party transportation costs paid by Range."
  ),
  realizedNglPerBbl: reported(
    26.62,
    "$/bbl",
    "Reported average realized NGL price excluding derivative settlements and third-party transportation costs."
  ),
  realizedOilPerBbl: reported(
    63.3,
    "$/bbl",
    "Reported average realized oil price excluding derivative settlements and third-party transportation costs."
  ),
  oilDifferentialToWtiPerBbl: reported(
    -10.68,
    "$/bbl",
    "Company disclosure used by the project for the Q1 2026 oil realization differential to WTI."
  ),
  directOperatingExpensePerMcfe: reported(
    0.14,
    "$/Mcfe",
    "Reported Q1 2026 direct operating expense per Mcfe."
  ),
  gatheringProcessingTransportationPerMcfe: reported(
    1.63,
    "$/Mcfe",
    "Reported Q1 2026 transportation, gathering, processing and compression expense per Mcfe."
  ),
  productionTaxesPerMcfe: reported(
    0.02931,
    "$/Mcfe",
    "Derived from $5.823 million of taxes other than income divided by 198.669207 million Mcfe of reported production."
  ),
  reportedGaMillion: reported(
    45.351,
    "$MM",
    "Reported Q1 2026 general and administrative expense."
  ),
  cashGaMillion: unavailable(
    "$MM",
    "The Form 10-Q reports total G&A but does not provide a directly usable cash G&A line in the cited table."
  ),
  reportedInterestExpenseMillion: reported(
    19.419,
    "$MM",
    "Reported Q1 2026 interest expense."
  ),
  cashInterestMillion: unavailable(
    "$MM",
    "Reported interest expense is not automatically equivalent to cash interest; a cash-interest reconciliation is required."
  ),
  balanceSheetNetDebtMillion: reported(
    819.007,
    "$MM",
    "Derived from bank debt net of issuance costs of $323.294 million plus senior notes net of issuance costs of $495.960 million less $0.247 million cash. This is carrying-value net debt, not face-value debt."
  ),
  dilutedSharesMillion: reported(
    236.396,
    "MM shares",
    "Reported diluted weighted-average common shares outstanding for Q1 2026."
  )
};

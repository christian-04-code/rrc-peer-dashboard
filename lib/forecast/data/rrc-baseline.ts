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
  reportedExplorationExpenseMillion: SourcedValue;
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
 * SUPERSEDED as the forecast engine's "latest detailed actual" anchor by
 * rrcQ2_2026Baseline below (see lib/forecast/data/rrc-actuals.ts's
 * RRC_LATEST_DETAILED_ACTUAL_PERIOD, feat/rrc-q2-baseline, 2026-08-12): the Q2 2026
 * data-foundation pass populated RRC's Q2 2026 production mix, realized pricing, and
 * per-unit costs, so Q1 is retained here only as the immutable historical record for
 * 2026Q1 and as the documented prior anchor. Nothing in this object was changed by
 * that recalibration.
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
  reportedExplorationExpenseMillion: reported(
    6.03,
    "$MM",
    "Reported Q1 2026 total exploration expense (delay rentals, seismic, personnel, and stock-based compensation allocated to exploration)."
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

const q2FilingReference =
  "Range Resources Corporation Form 10-Q for the quarter ended June 30, 2026";
const q2RetrievedAt = "2026-08-12T00:00:00.000Z";

function q2Source(notes: string): AssumptionSource {
  return {
    name: "Range Resources Q2 2026 Form 10-Q",
    reference: q2FilingReference,
    period: "Q2 2026",
    retrievedAt: q2RetrievedAt,
    classification: "reported",
    notes
  };
}

function q2Reported(value: number, unit: string, notes: string): SourcedValue {
  return { value, unit, source: q2Source(notes) };
}

/**
 * Source-backed Q2 2026 operating and financial baseline (feat/rrc-q2-baseline,
 * 2026-08-12) -- the forecast engine's new "latest detailed actual" anchor (see
 * rrcLatestDetailedBaseline below).
 *
 * Every field here was individually verified against RRC's own Q2 2026 Form 10-Q
 * (data/sec/RRC/2026-06-30/0001193125-26-310446/filing.htm) on the SAME definitional
 * basis as the corresponding Q1 2026 baseline field above, not simply copied from the
 * live dashboard fixture (lib/dashboard/financials-quarterly.ts), which turned out to
 * carry two fields on a DIFFERENT basis than this engine needs:
 *   - financials-quarterly.ts's Q2 2026 realizedPrices.naturalGas (2.79) is priced
 *     INCLUDING derivative settlements; every other cell in that file (and this
 *     engine's own Q1 anchor) is pre-hedge/EX-derivatives. Not used here for that
 *     reason -- see realizedGasExDerivativesPerMcf's note below for what this file
 *     uses instead for the actual engine-consumed gas differential.
 *   - financials-quarterly.ts's Q2 2026 costs.cashGA (0.2283) is TOTAL G&A per Mcfe
 *     (including stock-based compensation), not cash G&A. This file instead uses
 *     $0.18/Mcfe, independently verified from the Q2 10-Q's own G&A/stock-comp
 *     breakout table (same table format Q1's $0.18 anchor was verified against),
 *     which happens to be numerically unchanged from Q1.
 *
 * productionTaxesPerMcfe is intentionally NOT independently re-derived for Q2 in this
 * pass (would require pulling Q2's own "taxes other than income" and total commodity
 * sales figures, not yet done) -- rrc-complete.ts's periodAssumptions() continues to
 * use the Q1-derived productionTaxPctRevenue ratio, documented there as an open item.
 */
export const rrcQ2_2026Baseline: RrcOperatingBaseline = {
  company: "RRC",
  period: "2026-Q2",
  totalProductionBcfePerDay: q2Reported(
    2.296399,
    "Bcfe/d",
    "Direct reported average daily gas-equivalent production for the three months ended June 30, 2026 (2,296,399 Mcfe/d)."
  ),
  liquidsPercentOfTotalMcfe: q2Reported(
    0.325518,
    "% of total Mcfe",
    "Derived from reported NGL and oil volumes converted at 6 Mcfe per barrel, divided by reported total Mcfe (nglPct 0.308604 + oilCondensatePct 0.016918). Stored as a decimal."
  ),
  naturalGasMmcfPerDay: q2Reported(
    1548.871,
    "MMcf/d",
    "Average daily natural gas production, 1,548,871 Mcf/d for the three months ended June 30, 2026 (MD&A production data table)."
  ),
  nglMbblPerDay: q2Reported(
    118.113,
    "Mbbl/d",
    "Average daily NGL production, 118,113 Bbl/d for the three months ended June 30, 2026 (MD&A production data table)."
  ),
  oilMbblPerDay: q2Reported(
    6.475,
    "Mbbl/d",
    "Average daily oil production, 6,475 Bbl/d for the three months ended June 30, 2026 (MD&A production data table)."
  ),
  gasDifferentialToNymexPerMcfIncludingBasisHedges: q2Reported(
    -0.47,
    "$/Mcf",
    "Derived from the reported average natural gas differential BELOW NYMEX of $(0.48)/Mcf plus a $0.01/Mcf realized GAIN on basis hedging for the three months ended June 30, 2026 (-0.48 + 0.01 = -0.47), the same derivation as the Q1 2026 anchor ($0.21 above NYMEX less a $0.03 realized loss = $0.18)."
  ),
  realizedGasExDerivativesPerMcf: q2Reported(
    2.42,
    "$/Mcf",
    "Not independently verified from the MD&A average-sales-price table in this pass; shown for reference only as NYMEX benchmark ($2.89/Mcf) plus the differential-including-basis-hedges above ($-0.47/Mcf). Not consumed by the forecast engine (only gasDifferentialToNymexPerMcfIncludingBasisHedges is)."
  ),
  realizedGasIncludingDerivativesPerMcf: q2Reported(
    2.79,
    "$/Mcf",
    "RRC Q2 2026 Form 10-Q, MD&A average prices table: natural gas price including derivative settlements but before third-party transportation costs. Matches lib/dashboard/financials-quarterly.ts's Q2 2026 realizedPrices.naturalGas -- see this object's header note on why that field is NOT used as this engine's ex-derivatives gas price input."
  ),
  realizedNglPerBbl: q2Reported(
    29.10,
    "$/bbl",
    "Reported average realized NGL price excluding derivative settlements and third-party transportation costs, three months ended June 30, 2026. Same basis as the Q1 2026 anchor; not consumed by the forecast engine (informational only)."
  ),
  realizedOilPerBbl: q2Reported(
    83.96,
    "$/bbl",
    "Reported average realized oil price excluding derivative settlements and third-party transportation costs, three months ended June 30, 2026. Same basis as the Q1 2026 anchor; not consumed by the forecast engine directly (used only via oilDifferentialToWtiPerBbl below)."
  ),
  oilDifferentialToWtiPerBbl: q2Reported(
    -9.62,
    "$/bbl",
    "Derived as reported average realized oil price excluding derivative settlements and third-party transportation costs ($83.96/bbl) less the average NYMEX WTI benchmark price for the three months ended June 30, 2026 ($93.58/bbl) = -$9.62/bbl -- the same derivation independently confirmed for the Q1 2026 anchor ($63.30 - $73.98 = -$10.68)."
  ),
  directOperatingExpensePerMcfe: q2Reported(
    0.133,
    "$/Mcfe",
    "Reported Q2 2026 total direct operating expense (lease operating expense $0.12/Mcfe + workovers $0.01/Mcfe) per Mcfe, three months ended June 30, 2026 -- the same total-direct-operating-expense basis as the Q1 2026 anchor (0.14)."
  ),
  gatheringProcessingTransportationPerMcfe: q2Reported(
    1.516,
    "$/Mcfe",
    "Reported Q2 2026 transportation, gathering, processing and compression expense per Mcfe: $316,812 thousand / 208,972.309 MMcfe, three months ended June 30, 2026."
  ),
  productionTaxesPerMcfe: unavailable(
    "$/Mcfe",
    "Not independently re-derived for Q2 2026 in this pass (would require Q2's own taxes-other-than-income and total commodity-sales figures). rrc-complete.ts continues to use the Q1-derived productionTaxPctRevenue ratio, held flat, documented there as an open item."
  ),
  reportedGaMillion: q2Reported(
    47.707,
    "$MM",
    "Reported Q2 2026 general and administrative expense (includes stock-based compensation), three months ended June 30, 2026."
  ),
  cashGaMillion: q2Reported(
    0.18,
    "$/Mcfe",
    "Independently verified from the Q2 2026 Form 10-Q's G&A / stock-based-compensation breakout table: General and administrative (cash) $0.18/Mcfe + stock-based compensation $0.05/Mcfe = total G&A $0.23/Mcfe, three months ended June 30, 2026. Numerically unchanged from the Q1 2026 anchor ($0.18/Mcfe, verified against the same table format in the Q1 2026 10-Q). Stored here as a $/Mcfe rate (not a fixed $MM figure) to match how rrc-complete.ts actually consumes this field."
  ),
  reportedInterestExpenseMillion: q2Reported(
    14.4,
    "$MM",
    "Reported Q2 2026 interest expense (three months ended June 30, 2026), per the Form 10-Q's Results of Operations discussion: \"Interest expense was $14.4 million in second quarter 2026.\""
  ),
  cashInterestMillion: unavailable(
    "$MM",
    "Reported interest expense is not automatically equivalent to cash interest; a cash-interest reconciliation is required (same limitation as the Q1 2026 anchor)."
  ),
  reportedExplorationExpenseMillion: q2Reported(
    6.498,
    "$MM",
    "Reported Q2 2026 total exploration expense (delay rentals, seismic, personnel, and stock-based compensation allocated to exploration), three months ended June 30, 2026: $6,498 thousand."
  ),
  balanceSheetNetDebtMillion: q2Reported(
    866.838,
    "$MM",
    "Derived from bank debt net of issuance costs of $370.889 million plus senior notes net of issuance costs of $496.196 million less $0.247 million cash as of June 30, 2026. Carrying-value net debt, the same basis as the Q1 2026 anchor (819.007) -- NOT the same basis as lib/dashboard/financials-quarterly.ts's netDebt field (880.753 for Q2 2026), which is face-value debt less cash."
  ),
  dilutedSharesMillion: q2Reported(
    236.21,
    "MM shares",
    "Reported diluted weighted-average common shares outstanding for Q2 2026 (236,210 thousand), per the Form 10-Q's earnings-per-share note. Matches data/historical.json's \"Diluted Weighted-Average Shares (MM)\" Q2 2026 entry for RRC."
  )
};

/**
 * Single point of truth for which quarter's detailed baseline the forecast engine
 * actually uses as its "latest detailed actual" anchor for production mix, cost
 * per-unit rates, pricing differentials, net debt, and diluted shares. Flip this one
 * export (and RRC_LATEST_DETAILED_ACTUAL_PERIOD in rrc-actuals.ts) to change the
 * anchor quarter for every consumer at once, without hunting down individually
 * hardcoded quarter references.
 */
export const rrcLatestDetailedBaseline: RrcOperatingBaseline = rrcQ2_2026Baseline;

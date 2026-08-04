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
  realizedNglPerBbl: SourcedValue;
  oilDifferentialToWtiPerBbl: SourcedValue;
  directOperatingExpensePerMcfe: SourcedValue;
  gatheringProcessingTransportationPerMcfe: SourcedValue;
  productionTaxesPerMcfe: SourcedValue;
  cashGaMillion: SourcedValue;
  cashInterestMillion: SourcedValue;
  netDebtMillion: SourcedValue;
  dilutedSharesMillion: SourcedValue;
};

const retrievedAt = "2026-08-04T00:00:00.000Z";

function source(notes: string): AssumptionSource {
  return {
    name: "Range Resources Q1 2026 disclosures",
    reference: "Forecast Scenario Engine Design research; underlying Range Q1 2026 materials",
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
  return {
    value: null,
    unit,
    source: {
      ...source(notes),
      classification: "reported"
    }
  };
}

/**
 * Latest source-backed operating baseline currently available to the project.
 *
 * Important: the disclosed 32% liquids mix is not enough to split liquids into
 * NGL and oil volumes. Product-level volumes remain null until the underlying
 * Q1 2026 filing or supplement is loaded and verified.
 */
export const rrcQ1_2026Baseline: RrcOperatingBaseline = {
  company: "RRC",
  period: "2026-Q1",
  totalProductionBcfePerDay: reported(
    2.21,
    "Bcfe/d",
    "Reported total production for Q1 2026."
  ),
  liquidsPercentOfTotalMcfe: reported(
    0.32,
    "% of total Mcfe",
    "Reported product mix was approximately 32% liquids. Stored as decimal."
  ),
  naturalGasMmcfPerDay: unavailable(
    "MMcf/d",
    "Exact product-level natural gas volume not verified from the currently loaded source excerpt."
  ),
  nglMbblPerDay: unavailable(
    "Mbbl/d",
    "Exact NGL volume not verified; do not infer from the disclosed aggregate liquids percentage."
  ),
  oilMbblPerDay: unavailable(
    "Mbbl/d",
    "Exact oil/condensate volume not verified; do not infer from the disclosed aggregate liquids percentage."
  ),
  gasDifferentialToNymexPerMcfIncludingBasisHedges: reported(
    0.18,
    "$/Mcf",
    "Q1 2026 natural gas realization was reported at a $0.18/Mcf premium to NYMEX including basis hedges."
  ),
  realizedNglPerBbl: reported(
    26.62,
    "$/bbl",
    "Reported Q1 2026 NGL realization."
  ),
  oilDifferentialToWtiPerBbl: reported(
    -10.68,
    "$/bbl",
    "Reported Q1 2026 oil realization was $10.68/bbl below WTI."
  ),
  directOperatingExpensePerMcfe: unavailable(
    "$/Mcfe",
    "Exact Q1 2026 direct operating expense per Mcfe requires the underlying filing or supplement."
  ),
  gatheringProcessingTransportationPerMcfe: unavailable(
    "$/Mcfe",
    "Exact Q1 2026 GP&T cost per Mcfe requires the underlying filing or supplement."
  ),
  productionTaxesPerMcfe: unavailable(
    "$/Mcfe",
    "Exact Q1 2026 taxes other than income per Mcfe require the underlying filing or supplement."
  ),
  cashGaMillion: unavailable(
    "$MM",
    "Exact Q1 2026 cash G&A requires the underlying filing or supplement."
  ),
  cashInterestMillion: unavailable(
    "$MM",
    "Exact Q1 2026 cash interest requires the underlying filing or supplement."
  ),
  netDebtMillion: unavailable(
    "$MM",
    "Exact Q1 2026 net debt requires the underlying balance sheet and debt reconciliation."
  ),
  dilutedSharesMillion: unavailable(
    "MM shares",
    "Exact Q1 2026 diluted weighted-average shares require the underlying filing."
  )
};

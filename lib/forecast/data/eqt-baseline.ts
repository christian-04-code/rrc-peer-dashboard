import type { AssumptionSource } from "@/lib/forecast/types";
import type { PeerOperatingBaseline } from "@/lib/forecast/scenarios/annual-shared";

/**
 * Source-backed EQT (EQT Corporation) Q2 2026 operating and financial baseline --
 * the forecast engine's "latest detailed actual" anchor, used only as the
 * reported-actual-held-flat fallback when a metric has no current or
 * carried-forward management guidance (see lib/forecast/guidance/eqt.ts and
 * scenarios/eqt-annual.ts for the guidance-first resolution order).
 *
 * Production/pricing figures come directly from lib/dashboard/
 * financials-quarterly.ts's already-audited EQT Q2 2026 entry. Cost per-unit
 * figures below are used only where EQT has no current cost guidance (EQT
 * separately guides LOE/gathering/transmission/processing/production-tax/SG&A
 * individually this cycle -- see scenarios/eqt-annual.ts -- so this baseline's
 * cost fields are a secondary fallback, not the primary default). Net debt and
 * diluted shares come from lib/dashboard/market-cap-quarterly.ts's Q2 2026 EQT
 * entry. Interest expense and the gas/oil price benchmark decomposition were
 * independently pulled from EQT's own Q2 2026 Form 10-Q
 * (data/sec/EQT/2026-06-30/0000033213-26-000043/filing.htm), since EQT does not
 * guide a gas or oil differential this cycle.
 */

const retrievedAt = "2026-08-12T00:00:00.000Z";

function source(name: string, reference: string, notes: string): AssumptionSource {
  return { name, reference, period: "Q2 2026", retrievedAt, classification: "reported", notes };
}

function reported(value: number, unit: string, name: string, reference: string, notes: string) {
  return { value, unit, source: source(name, reference, notes) };
}

// EQT Q2 2026 production was 6,972.242 MMcfe/d over 91 days = 634,474.0 MMcfe
// (matches the Q2 2026 10-Q's own "Total sales volume (MMcfe) 634,474" exactly).
// EQT's guided FY2026 production-tax rate ($0.07/Mcfe) converts to a %-of-revenue
// rate as: ($0.07/Mcfe x 634,474 MMcfe / 1000) / $1,809.94mm Q2 2026 revenue =
// 2.4538%. This baseline field is the fallback only; scenarios/eqt-annual.ts uses
// EQT's own current guidance for this metric directly.
const EQT_PRODUCTION_TAX_PCT_REVENUE_FALLBACK = 2.4538 / 100;

export const eqtLatestDetailedBaseline: PeerOperatingBaseline = {
  ticker: "EQT",
  period: "2026-Q2",
  gasMmcfPerDay: reported(
    6560.264,
    "MMcf/d",
    "EQT Corporation",
    "EQT Q2 2026 Form 10-Q",
    "MD&A average realized price reconciliation table: natural gas sales volume 596,984 MMcf for the three months ended June 30, 2026, divided by 91 calendar days."
  ),
  nglMbblPerDay: reported(
    63.527,
    "Mbbl/d",
    "EQT Corporation",
    "EQT Q2 2026 Form 10-Q",
    "MD&A average realized price reconciliation table: NGLs-excluding-ethane sales volume 3,459 MBbl plus ethane sales volume 2,322 MBbl for the three months ended June 30, 2026, divided by 91 calendar days (combined-NGL convention)."
  ),
  oilMbblPerDay: reported(
    5.143,
    "Mbbl/d",
    "EQT Corporation",
    "EQT Q2 2026 Form 10-Q",
    "MD&A average realized price reconciliation table: oil sales volume 468 MBbl for the three months ended June 30, 2026, divided by 91 calendar days."
  ),
  loePerMcfe: reported(
    0.0990,
    "$/Mcfe",
    "EQT Corporation",
    "EQT Q2 2026 Form 10-Q",
    "Business segment results 'Per Unit ($/Mcfe)' table: LOE $62,837 thousand / 634,474 MMcfe total sales volume, three months ended June 30, 2026."
  ),
  gatheringTransportPerMcfe: reported(
    0.6068,
    "$/Mcfe",
    "EQT Corporation",
    "EQT Q2 2026 Form 10-Q",
    "Gathering ($57,991K) + Transmission ($253,844K) + Processing ($73,182K), excluding the intercompany affiliate-transport elimination line, / 634,474 MMcfe, three months ended June 30, 2026."
  ),
  productionTaxPctRevenue: reported(
    EQT_PRODUCTION_TAX_PCT_REVENUE_FALLBACK,
    "decimal",
    "EQT Corporation",
    "EQT Q2 2026 Form 10-Q guidance / earnings release",
    "Derived: EQT's guided FY2026 production-tax rate ($0.07/Mcfe) applied to Q2 2026 production (6,972.242 MMcfe/d x 91 days), divided by Q2 2026 revenue ($1,809.94mm). Fallback only -- scenarios/eqt-annual.ts uses EQT's current opex_production_taxes guidance directly as the primary default."
  ),
  cashGaPerMcfe: {
    value: null,
    unit: "$/Mcfe",
    source: source(
      "EQT Corporation",
      "N/A",
      "Not independently re-derived from the raw Q2 2026 10-Q in this pass (financials-quarterly.ts's own Q2 2026 EQT entry left this field null). Not used as the primary default: EQT's own guided FY2026 opex_sga ($0.20/Mcfe) takes precedence -- see scenarios/eqt-annual.ts."
    )
  },
  explorationMillionPerQuarter: {
    value: 0,
    unit: "$mm",
    source: source(
      "EQT Corporation",
      "EQT Q2 2026 Form 10-Q",
      "EQT does not present a separate exploration-expense income-statement line item (unlike RRC). Modeled as $0 for this bucket rather than left null, since a null value would silently zero out the entire EBITDAX/FCF calculation chain -- this is a structural difference in EQT's cost presentation, not an unreported figure."
    )
  },
  cashInterestMillionPerQuarter: reported(
    75.452,
    "$mm",
    "EQT Corporation",
    "EQT Q2 2026 Form 10-Q",
    "Reported interest expense, net, for the three months ended June 30, 2026 (consolidated statement of operations). Used as a cash-interest proxy, held flat; not independently reconciled to cash interest paid, same convention as the RRC reference model."
  ),
  capexMillionPerQuarter: {
    value: 666.258,
    unit: "$mm",
    source: source(
      "EQT Corporation",
      "EQT Q2 2026 earnings materials",
      "Q2 2026 capital expenditures per lib/dashboard/financials-quarterly.ts's already-audited EQT entry."
    )
  },
  gasBasisPerMcf: reported(
    0.16 + -0.67,
    "$/Mcf",
    "EQT Corporation",
    "EQT Q2 2026 Form 10-Q",
    "Derived directly from EQT's own MD&A natural-gas price reconciliation table: Btu uplift ($0.16/Mcf) plus basis ($(0.67)/Mcf, before cash-settled basis swaps -- none were settled this quarter), three months ended June 30, 2026. NYMEX price $2.89/MMBtu + this $(0.51)/Mcf differential = EQT's disclosed 'Average adjusted price' of $2.38/Mcf (pre-cash-settled-derivatives), which reconciles exactly. Used as the fallback default only -- EQT does not guide a forward gas differential this cycle."
  ),
  oilDifferentialPerBbl: reported(
    70.14 - 93.58,
    "$/bbl",
    "EQT Corporation",
    "EQT Q2 2026 Form 10-Q / RRC Q2 2026 Form 10-Q (WTI benchmark)",
    "Derived: Q2 2026 reported realized oil price ($70.14/bbl, pre-hedge) less the Q2 2026 NYMEX WTI benchmark average ($93.58/bbl, per Range Resources' Q2 2026 Form 10-Q MD&A disclosure -- the same public market-wide benchmark applies to every company). EQT does not guide an oil differential; oil is an immaterial <1% of EQT's total production (5.143 Mbbl/d of 6,972.242 MMcfe/d)."
  ),
  nglRealizationPctOfWti: reported(
    26.45 / 93.58,
    "% of WTI",
    "EQT Corporation",
    "EQT Q2 2026 Form 10-Q",
    "Derived: Q2 2026 blended realized NGL price ($26.45/bbl, volume-weighted average of NGLs-excluding-ethane and ethane, pre-cash-settled-derivatives) divided by the Q2 2026 NYMEX WTI benchmark average ($93.58/bbl). EQT does not guide an NGL price or differential this cycle."
  ),
  netDebtMillion: reported(
    5542.851,
    "$mm",
    "EQT Corporation",
    "EQT Q2 2026 Form 10-Q",
    "Quarter-end total debt principal less cash and cash equivalents, per lib/dashboard/financials-quarterly.ts's already-audited EQT entry. Face-value-less-cash basis, not carrying value -- a different basis than the RRC reference model's own net-debt convention (RRC uses carrying value net of issuance costs); flagged as an open item."
  ),
  dilutedSharesMillion: reported(
    629.049,
    "MM shares",
    "EQT Corporation",
    "EQT Q2 2026 Form 10-Q",
    "Diluted weighted-average common shares outstanding for the three months ended June 30, 2026, per lib/dashboard/market-cap-quarterly.ts's already-audited EQT Q2 2026 entry."
  )
};

/** Current-market-implied EV/EBITDAX (Q2 2026 market cap + net debt, over Q2 2026 EBITDAX annualized), +-1.0x band -- same preset-banding convention as the RRC reference model, independently computed from EQT's own market data. EQT's higher multiple reflects its scale/liquidity premium as the largest Appalachian gas producer. */
export const EQT_VALUATION_PRESETS = { bear: 7.0, base: 8.0, bull: 9.0 } as const;

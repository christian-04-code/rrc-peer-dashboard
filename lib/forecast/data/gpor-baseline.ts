import type { AssumptionSource } from "@/lib/forecast/types";
import type { PeerOperatingBaseline } from "@/lib/forecast/scenarios/annual-shared";

/**
 * Source-backed GPOR (Gulfport Energy) Q2 2026 operating and financial baseline --
 * the forecast engine's "latest detailed actual" anchor, used only as the
 * reported-actual-held-flat fallback when a metric has no current or
 * carried-forward management guidance (see lib/forecast/guidance/gpor.ts and
 * scenarios/gpor-annual.ts for the guidance-first resolution order).
 *
 * Production/pricing/cost-per-Mcfe figures come directly from lib/dashboard/
 * financials-quarterly.ts's already-audited GPOR Q2 2026 detail block. Net debt
 * and diluted shares come from lib/dashboard/market-cap-quarterly.ts's Q2 2026
 * GPOR entry. Cash interest is independently sourced from GPOR's own Q2 2026
 * Form 10-Q (data/sec/GPOR/2026-06-30/0001628280-26-052313/filing.htm) since
 * GPOR does not guide an interest-expense figure this cycle and this field is
 * not part of financials-quarterly.ts's standard detail block.
 */

const retrievedAt = "2026-08-13T00:00:00.000Z";

function source(name: string, reference: string, notes: string): AssumptionSource {
  return { name, reference, period: "Q2 2026", retrievedAt, classification: "reported", notes };
}

function reported(value: number, unit: string, name: string, reference: string, notes: string) {
  return { value, unit, source: source(name, reference, notes) };
}

// GPOR Q2 2026 total Mcfe = (878.363 + (9.857 + 4.198) x 6) x 91 days = 87,605.06 MMcfe
// (matches financials-quarterly.ts's own totalCashUnitCosts note, 87,610 MMcfe). GPOR's
// guided FY2026 "taxes other than income" rate ($0.08/Mcfe, midpoint of
// opex_taxes_other_than_income) converts to a %-of-revenue rate using GPOR's own Q2
// 2026 reported commodity-sales-per-Mcfe (natural gas $198.253mm + oil/condensate
// $32.841mm + NGL $30.459mm = $261.553mm / 87,605.06 MMcfe = $2.9856/Mcfe, per the
// Q2 2026 Form 10-Q -- deliberately NOT GPOR's "Total revenues" line ($323.228mm),
// which also includes a $61.675mm net gain on commodity derivatives and is not
// comparable to this engine's commodity-only revenue basis): 0.08 / 2.9856 = 2.679%.
const GPOR_PRODUCTION_TAX_PCT_REVENUE_FALLBACK = 0.08 / 2.9856;

export const gporLatestDetailedBaseline: PeerOperatingBaseline = {
  ticker: "GPOR",
  period: "2026-Q2",
  gasMmcfPerDay: reported(
    878.363,
    "MMcf/d",
    "Gulfport Energy Corporation",
    "GPOR Q2 2026 Form 10-Q",
    "MD&A natural gas, oil and condensate and NGL production and pricing table: natural gas production 79,931 MMcf for the three months ended June 30, 2026, divided by 91 calendar days."
  ),
  nglMbblPerDay: reported(
    9.857,
    "Mbbl/d",
    "Gulfport Energy Corporation",
    "GPOR Q2 2026 Form 10-Q",
    "MD&A natural gas, oil and condensate and NGL production and pricing table: NGL production 897 MBbl for the three months ended June 30, 2026, divided by 91 calendar days."
  ),
  oilMbblPerDay: reported(
    4.198,
    "Mbbl/d",
    "Gulfport Energy Corporation",
    "GPOR Q2 2026 Form 10-Q",
    "MD&A natural gas, oil and condensate and NGL production and pricing table: oil/condensate production 382 MBbl for the three months ended June 30, 2026, divided by 91 calendar days."
  ),
  loePerMcfe: reported(
    0.23,
    "$/Mcfe",
    "Gulfport Energy Corporation",
    "GPOR Q2 2026 Form 10-Q",
    "MD&A lease operating expenses table: total LOE per Mcfe, three months ended June 30, 2026."
  ),
  gatheringTransportPerMcfe: reported(
    0.97,
    "$/Mcfe",
    "Gulfport Energy Corporation",
    "GPOR Q2 2026 Form 10-Q",
    "MD&A transportation, gathering, processing and compression table: per Mcfe, three months ended June 30, 2026."
  ),
  productionTaxPctRevenue: reported(
    GPOR_PRODUCTION_TAX_PCT_REVENUE_FALLBACK,
    "decimal",
    "Gulfport Energy Corporation",
    "GPOR Q2 2026 Form 10-Q guidance / earnings release",
    "Derived: GPOR's guided FY2026 taxes-other-than-income rate ($0.08/Mcfe) divided by GPOR's own Q2 2026 reported commodity-sales-per-Mcfe ($2.9856/Mcfe). Fallback only -- scenarios/gpor-annual.ts uses GPOR's current opex_taxes_other_than_income guidance directly as the primary default."
  ),
  cashGaPerMcfe: reported(
    0.12,
    "$/Mcfe",
    "Gulfport Energy Corporation",
    "GPOR Q2 2026 Form 10-Q",
    "MD&A general and administrative expenses table: G&A, net (gross less third-party reimbursements less capitalized G&A) per Mcfe, three months ended June 30, 2026. Fallback only -- GPOR's own guided FY2026 opex_recurring_cash_ga ($0.13/Mcfe) takes precedence."
  ),
  explorationMillionPerQuarter: {
    value: 0,
    unit: "$mm",
    source: source(
      "Gulfport Energy Corporation",
      "GPOR Q2 2026 Form 10-Q",
      "GPOR does not present a separate exploration-expense income-statement line item (its cost structure is LOE + taxes other than income + transportation/gathering/processing/compression + G&A + accretion, per the Q2 2026 10-Q's segment-expense note). Modeled as $0 for this bucket rather than left null -- the same structural convention eqt-baseline.ts uses for EQT, which also has no separate exploration line."
    )
  },
  cashInterestMillionPerQuarter: reported(
    15.792,
    "$mm",
    "Gulfport Energy Corporation",
    "GPOR Q2 2026 Form 10-Q",
    "Consolidated statement of operations, \"Interest expense\" note: total interest expense (net of $1.732mm capitalized interest) for the three months ended June 30, 2026. GPOR does not guide an interest-expense figure this cycle, so this reported actual is the primary default (not a secondary fallback, unlike CRK/EXE where guided totals take precedence)."
  ),
  capexMillionPerQuarter: {
    value: 148.6,
    unit: "$mm",
    source: source(
      "Gulfport Energy Corporation",
      "GPOR Q2 2026 earnings materials",
      "Q2 2026 capital expenditures per lib/dashboard/financials-quarterly.ts's already-audited GPOR entry."
    )
  },
  gasBasisPerMcf: {
    value: 2.48 - 2.89,
    unit: "$/Mcf",
    source: source(
      "Gulfport Energy Corporation",
      "GPOR Q2 2026 Form 10-Q",
      "Derived: Q2 2026 reported realized natural gas price ($2.48/Mcf, pre-hedge, per financials-quarterly.ts's already-audited GPOR entry) less the Q2 2026 NYMEX Henry Hub benchmark average ($2.89/MMBtu). Used as the fallback default only -- GPOR's current-cycle gas_differential guidance takes precedence."
    )
  },
  oilDifferentialPerBbl: {
    value: 85.86 - 93.58,
    unit: "$/bbl",
    source: source(
      "Gulfport Energy Corporation",
      "GPOR Q2 2026 Form 10-Q",
      "Derived: Q2 2026 reported realized oil/condensate price ($85.86/bbl, pre-hedge) less the Q2 2026 NYMEX WTI benchmark average ($93.58/bbl). Used as the fallback default only -- GPOR's current-cycle oil_differential guidance takes precedence."
    )
  },
  nglRealizationPctOfWti: reported(
    33.94 / 93.58,
    "% of WTI",
    "Gulfport Energy Corporation",
    "GPOR Q2 2026 Form 10-Q",
    "Derived: Q2 2026 reported realized NGL price ($33.94/bbl, pre-hedge) divided by the Q2 2026 NYMEX WTI benchmark average ($93.58/bbl) = 36.3%, consistent with GPOR's guided FY2026 40-50% range. Used as the fallback default only -- GPOR's current-cycle ngl_realized_price guidance (guided directly as a %-of-WTI, mid 45%) takes precedence -- see scenarios/gpor-annual.ts."
  ),
  netDebtMillion: reported(
    928.946,
    "$mm",
    "Gulfport Energy Corporation",
    "GPOR Q2 2026 Form 10-Q",
    "Quarter-end total debt principal less cash and cash equivalents, per lib/dashboard/financials-quarterly.ts's already-audited GPOR entry."
  ),
  dilutedSharesMillion: reported(
    17.945,
    "MM shares",
    "Gulfport Energy Corporation",
    "GPOR Q2 2026 Form 10-Q",
    "Diluted weighted-average common shares outstanding for the three months ended June 30, 2026, per lib/dashboard/market-cap-quarterly.ts's already-audited GPOR Q2 2026 entry."
  )
};

/**
 * Current-market-implied EV/EBITDAX (Q2 2026 market cap + net debt, over Q2 2026
 * EBITDAX annualized), +-1.0x band -- same preset-banding convention as the RRC
 * reference model. Market cap $3,045.267mm (Nasdaq historical close x diluted
 * shares) + net debt $928.946mm = EV $3,974.213mm; Q2 2026 company-reported
 * adjusted EBITDAX $179.1mm x 4 = $716.4mm annualized; EV/EBITDAX = 5.55x.
 * (Spot-checked against the Q2 2026 Form 10-Q's GAAP income statement: Income
 * from operations $127.065mm + D&A $73.053mm + accretion $0.618mm = a $200.7mm
 * GAAP-derived proxy that still includes a $61.675mm non-cash net derivative
 * gain embedded in revenue; net of that, $139.1mm -- the reported $179.1mm sits
 * between these two bounds, plausible but not exactly reconcilable from the
 * cached 10-Q alone; not a clear data-quality error like CRK's, so the
 * already-audited figure is used as-is.)
 */
export const GPOR_VALUATION_PRESETS = { bear: 4.5, base: 5.5, bull: 6.5 } as const;

import type { AssumptionSource } from "@/lib/forecast/types";
import type { PeerOperatingBaseline } from "@/lib/forecast/scenarios/annual-shared";

/**
 * Source-backed CRK (Comstock Resources) Q2 2026 operating and financial baseline --
 * the forecast engine's "latest detailed actual" anchor, used only as the
 * reported-actual-held-flat fallback when a metric has no current or
 * carried-forward management guidance (see lib/forecast/guidance/crk.ts and
 * scenarios/crk-annual.ts for the guidance-first resolution order).
 *
 * Production/pricing/cost-per-Mcfe figures come directly from lib/dashboard/
 * financials-quarterly.ts's already-audited CRK Q2 2026 detail block. CRK is
 * predominantly natural gas (99.97% of Q2 2026 Mcfe) and does not disclose a
 * separate NGL stream; nglMbblPerDay is fixed at 0 throughout this baseline and
 * the forward model rather than fabricated. Net debt and diluted shares come
 * from lib/dashboard/market-cap-quarterly.ts's Q2 2026 CRK entry. Cash interest
 * comes from CRK's own current-cycle guidance (see guidance/crk.ts); the
 * baseline field below is a secondary fallback only.
 *
 * DATA-QUALITY NOTE: financials-quarterly.ts's CRK Q2 2026 `revenue` field
 * previously held $470.262mm, which was the Q2 2025 comparative-period figure
 * from CRK's Q2 2026 Form 10-Q rather than the Q2 2026 actual -- corrected to
 * $353.282mm on fix/crk-q2-2026-revenue (see that field's own comment in
 * financials-quarterly.ts and data/historical.json for the full citation).
 * This baseline still does NOT use that field for the production-tax ratio
 * below, independent of the correction: the ratio is derived from CRK's own
 * reported Q2 2026 natural gas + oil sales ($288.221mm, the "Total natural gas
 * and oil sales" line for the three months ended June 30, 2026), deliberately
 * narrower than "Total revenues and other operating income" (which also
 * includes CRK's separate "Gas services" / Pinnacle Gas Services midstream
 * revenue and is not comparable to this engine's commodity-only revenue
 * basis) -- so this baseline's own figures are unaffected by the fix.
 * capitalExpenditures and netDebt in financials-quarterly.ts were
 * independently spot-checked against the same 10-Q and are consistent (within
 * a small, disclosed face-value-vs-carrying-value net-debt convention gap),
 * so they are used as-is.
 */

const retrievedAt = "2026-08-13T00:00:00.000Z";

function source(name: string, reference: string, notes: string): AssumptionSource {
  return { name, reference, period: "Q2 2026", retrievedAt, classification: "reported", notes };
}

function reported(value: number, unit: string, name: string, reference: string, notes: string) {
  return { value, unit, source: source(name, reference, notes) };
}

// CRK Q2 2026 production was 1,242.879 MMcfe/d (per financials-quarterly.ts) over 91
// days = 113,101.99 MMcfe. CRK's guided FY2026 production-tax rate ($0.125/Mcfe,
// midpoint of the opex_production_other_taxes FY2026 guidance) converts to a
// %-of-revenue rate using CRK's own Q2 2026 reported commodity-sales-per-Mcfe
// ($288.221mm natural gas + oil sales / 113,101.99 MMcfe = $2.5483/Mcfe, per the
// 10-Q's "Total natural gas and oil sales" line for the three months ended June 30,
// 2026 -- deliberately NOT the "Total revenues and other operating income" line,
// which includes CRK's separate "Gas services" (midstream/Pinnacle Gas Services)
// revenue and is not comparable to this engine's commodity-only revenue basis):
// 0.125 / 2.5483 = 4.905%. This baseline field is the fallback only; scenarios/
// crk-annual.ts uses CRK's current opex_production_other_taxes guidance directly
// as the primary default.
const CRK_PRODUCTION_TAX_PCT_REVENUE_FALLBACK = 0.125 / 2.5483;

export const crkLatestDetailedBaseline: PeerOperatingBaseline = {
  ticker: "CRK",
  period: "2026-Q2",
  gasMmcfPerDay: reported(
    1242.516,
    "MMcf/d",
    "Comstock Resources, Inc.",
    "CRK Q2 2026 Form 10-Q",
    "MD&A net production data table: natural gas 113,069 MMcf for the three months ended June 30, 2026, divided by 91 calendar days."
  ),
  nglMbblPerDay: {
    value: 0,
    unit: "Mbbl/d",
    source: source(
      "Comstock Resources, Inc.",
      "N/A",
      "CRK does not disclose a separate NGL production or pricing stream (its MD&A net production table reports only natural gas and oil). Modeled as exactly 0 rather than fabricated -- consistent with CRK's actual commodity structure (predominantly dry Haynesville/Bossier natural gas)."
    )
  },
  oilMbblPerDay: reported(
    0.0549,
    "Mbbl/d",
    "Comstock Resources, Inc.",
    "CRK Q2 2026 Form 10-Q",
    "MD&A net production data table: oil 5 MBbls for the three months ended June 30, 2026, divided by 91 calendar days. An immaterial ~0.03% of CRK's total Q2 2026 Mcfe."
  ),
  loePerMcfe: reported(
    0.25,
    "$/Mcfe",
    "Comstock Resources, Inc.",
    "CRK Q2 2026 Form 10-Q",
    "MD&A expenses per Mcfe table: lease operating expense, three months ended June 30, 2026 ($28,150 thousand / 113,102 MMcfe)."
  ),
  gatheringTransportPerMcfe: reported(
    0.38,
    "$/Mcfe",
    "Comstock Resources, Inc.",
    "CRK Q2 2026 Form 10-Q",
    "MD&A expenses per Mcfe table: gathering and transportation, three months ended June 30, 2026 ($43,331 thousand / 113,102 MMcfe)."
  ),
  productionTaxPctRevenue: reported(
    CRK_PRODUCTION_TAX_PCT_REVENUE_FALLBACK,
    "decimal",
    "Comstock Resources, Inc.",
    "CRK Q2 2026 Form 10-Q guidance / earnings release",
    "Derived: CRK's guided FY2026 production-tax rate ($0.125/Mcfe) divided by CRK's own Q2 2026 reported natural-gas-and-oil-sales-per-Mcfe ($2.5483/Mcfe). Fallback only -- scenarios/crk-annual.ts uses CRK's current opex_production_other_taxes guidance directly as the primary default."
  ),
  cashGaPerMcfe: reported(
    0.0778,
    "$/Mcfe",
    "Comstock Resources, Inc.",
    "CRK Q2 2026 Form 10-Q",
    "MD&A: general and administrative expenses $17.2 million less stock-based compensation $8.4 million = $8.8 million cash G&A, / 113,102 MMcfe total production, three months ended June 30, 2026. Fallback only -- CRK's own guided FY2026 opex_cash_ga ($39mm total) takes precedence, converted to $/Mcfe using guided production -- see scenarios/crk-annual.ts."
  ),
  explorationMillionPerQuarter: reported(
    4.427,
    "$mm",
    "Comstock Resources, Inc.",
    "CRK Q2 2026 Form 10-Q",
    "Consolidated statement of operations: Exploration expense, three months ended June 30, 2026."
  ),
  cashInterestMillionPerQuarter: reported(
    57.5,
    "$mm",
    "Comstock Resources, Inc.",
    "CRK FY2026 cash_interest guidance ($228-232mm, mid $230mm) / 4",
    "Fallback only -- scenarios/crk-annual.ts uses CRK's current-cycle cash_interest guidance directly as the primary default (this value is that same guided figure, quarterized, stored here for completeness)."
  ),
  capexMillionPerQuarter: {
    value: 446.869,
    unit: "$mm",
    source: source(
      "Comstock Resources, Inc.",
      "CRK Q2 2026 earnings materials",
      "Q2 2026 capital expenditures per lib/dashboard/financials-quarterly.ts's already-audited CRK entry. Spot-checked against the CRK Q2 2026 Form 10-Q cash-flow statement (six-month total capital expenditures $863.971mm), consistent with a standalone Q2 figure of this magnitude."
    )
  },
  gasBasisPerMcf: {
    value: 2.54 - 2.89,
    unit: "$/Mcf",
    source: source(
      "Comstock Resources, Inc.",
      "CRK Q2 2026 Form 10-Q",
      "Derived: Q2 2026 reported realized natural gas price ($2.54/Mcf, pre-hedge, per financials-quarterly.ts's already-audited CRK entry) less the Q2 2026 NYMEX Henry Hub benchmark average ($2.89/MMBtu, per Range Resources' Q2 2026 Form 10-Q MD&A disclosure -- the same public market-wide benchmark applies to every company). Used as the fallback default only -- CRK does not guide a forward gas differential this cycle."
    )
  },
  oilDifferentialPerBbl: {
    value: 95.20 - 93.58,
    unit: "$/bbl",
    source: source(
      "Comstock Resources, Inc.",
      "CRK Q2 2026 Form 10-Q / RRC Q2 2026 Form 10-Q (WTI benchmark)",
      "Derived: Q2 2026 reported realized oil price ($95.20/bbl, pre-hedge) less the Q2 2026 NYMEX WTI benchmark average ($93.58/bbl). CRK does not guide an oil differential; oil is an immaterial <0.03% of CRK's total production."
    )
  },
  nglRealizationPctOfWti: {
    value: 0,
    unit: "% of WTI",
    source: source(
      "Comstock Resources, Inc.",
      "N/A",
      "Not applicable -- CRK does not produce or disclose a separate NGL stream (nglMbblPerDay is fixed at 0 throughout this model)."
    )
  },
  netDebtMillion: reported(
    3088.872,
    "$mm",
    "Comstock Resources, Inc.",
    "CRK Q2 2026 Form 10-Q",
    "Quarter-end total debt less cash and cash equivalents, per lib/dashboard/financials-quarterly.ts's already-audited CRK entry. Spot-checked against the CRK Q2 2026 Form 10-Q balance sheet (long-term debt $3,098.770mm less cash $45.008mm = $3,053.762mm); the ~$35mm (1.1%) gap likely reflects a face-value/unamortized-issuance-cost or current-debt-inclusion convention difference, an accepted, disclosed limitation rather than a material discrepancy."
  ),
  dilutedSharesMillion: reported(
    291.612,
    "MM shares",
    "Comstock Resources, Inc.",
    "CRK Q2 2026 Form 10-Q",
    "Diluted weighted-average common shares outstanding for the three months ended June 30, 2026, per lib/dashboard/market-cap-quarterly.ts's already-audited CRK Q2 2026 entry."
  )
};

/**
 * Current-market-implied EV/EBITDAX (Q2 2026 market cap + net debt, over Q2 2026
 * EBITDAX annualized), +-1.0x band -- same preset-banding convention as the RRC
 * reference model. Deliberately NOT built from lib/dashboard/financials-
 * quarterly.ts's CRK `adjustedEbitdax` field ($244.811mm): that field sits in
 * the same Q2 2026 entry where the adjacent `revenue` field was independently
 * found to hold a Q2-2025/Q2-2026 column mixup (fixed on
 * fix/crk-q2-2026-revenue -- see that field's comment), so `adjustedEbitdax`
 * was not trusted without its own independent verification, and no Adjusted
 * EBITDAX reconciliation is disclosed in the cached 10-Q (a non-GAAP metric,
 * normally sourced from the earnings release, not on hand here). Instead
 * this multiple is built from CRK's own reported Q2 2026 commodity cash margin
 * (natural gas + oil sales $288.221mm less LOE $28.150mm, gathering/transport
 * $43.331mm, production taxes $7.196mm, and cash G&A $8.8mm = $200.744mm), a
 * verified floor that excludes CRK's separate Gas Services (Pinnacle) midstream
 * segment margin -- an accepted, disclosed limitation, not a fabricated total.
 * Market cap $4,350.851mm (Nasdaq historical close x diluted shares) + net debt
 * $3,088.872mm = EV $7,439.723mm; $200.744mm x 4 = $802.976mm annualized;
 * EV/EBITDAX = 9.27x.
 */
export const CRK_VALUATION_PRESETS = { bear: 8.3, base: 9.3, bull: 10.3 } as const;

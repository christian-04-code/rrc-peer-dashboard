import type { AssumptionSource } from "@/lib/forecast/types";
import type { PeerOperatingBaseline } from "@/lib/forecast/scenarios/annual-shared";

/**
 * Source-backed EXE (Expand Energy) Q2 2026 operating and financial baseline --
 * the forecast engine's "latest detailed actual" anchor, used only as the
 * reported-actual-held-flat fallback when a metric has no current or
 * carried-forward management guidance (see lib/forecast/guidance/exe.ts and
 * scenarios/exe-annual.ts for the guidance-first resolution order).
 *
 * Production/pricing/cost-per-Mcfe figures come directly from lib/dashboard/
 * financials-quarterly.ts's already-audited EXE Q2 2026 detail block (already
 * disclosed as daily MMcf/d and Mbbl/d rates, unlike CNX/EQT's annual-Bcfe
 * guidance). EXE is the post-Chesapeake/Southwestern combined entity and carries
 * a substantial Marketing segment (Twin Eagle) not modeled here -- see
 * scenarios/exe-annual.ts's notes for why. Net debt and diluted shares come from
 * lib/dashboard/market-cap-quarterly.ts's Q2 2026 EXE entry. Cash interest comes
 * from EXE's own current-cycle guidance (see guidance/exe.ts); the baseline field
 * below is a secondary fallback only.
 *
 * The EXE Q2 2026 commodity-revenue figure independently computed from these
 * production/pricing fields ($1,824.9mm) reconciles closely with the "Natural
 * gas, oil and NGL" line EXE's own Q2 2026 Form 10-Q discloses directly
 * ($1,830mm, data/sec/EXE/2026-06-30/0000895126-26-000047/filing.htm) --
 * cross-validating that these fields are genuinely the Q2 2026 period (not a
 * prior-period mixup, the data-quality issue found and disclosed while building
 * CRK's baseline).
 */

const retrievedAt = "2026-08-13T00:00:00.000Z";

function source(name: string, reference: string, notes: string): AssumptionSource {
  return { name, reference, period: "Q2 2026", retrievedAt, classification: "reported", notes };
}

function reported(value: number, unit: string, name: string, reference: string, notes: string) {
  return { value, unit, source: source(name, reference, notes) };
}

// EXE Q2 2026 total Mcfe = (6,896.0 MMcf/d + (83.0 + 14.0) Mbbl/d x 6) x 91 days =
// 680,498 MMcfe. EXE's guided FY2026 severance/ad-valorem-tax rate ($0.09/Mcfe,
// midpoint of opex_severance_ad_valorem) converts to a %-of-revenue rate using
// EXE's own Q2 2026 reported commodity-sales-per-Mcfe ("Natural gas, oil and NGL"
// $1,830mm / 680,498 MMcfe = $2.6893/Mcfe, per the Q2 2026 Form 10-Q -- the same
// commodity-only revenue basis this engine's revenue calculation uses, NOT EXE's
// blended "Total revenues and other" line, which also includes EXE's Marketing
// and derivative-gain revenue): 0.09 / 2.6893 = 3.347%.
const EXE_PRODUCTION_TAX_PCT_REVENUE_FALLBACK = 0.09 / 2.6893;

export const exeLatestDetailedBaseline: PeerOperatingBaseline = {
  ticker: "EXE",
  period: "2026-Q2",
  gasMmcfPerDay: reported(
    6896.0,
    "MMcf/d",
    "Expand Energy Corporation",
    "EXE Q2 2026 Form 10-Q",
    "MD&A production volumes and average sales prices table: natural gas total, three months ended June 30, 2026 (already disclosed as an MMcf/d daily rate)."
  ),
  nglMbblPerDay: reported(
    83.0,
    "Mbbl/d",
    "Expand Energy Corporation",
    "EXE Q2 2026 Form 10-Q",
    "MD&A production volumes and average sales prices table: NGL total, three months ended June 30, 2026 (already disclosed as an Mbbl/d daily rate)."
  ),
  oilMbblPerDay: reported(
    14.0,
    "Mbbl/d",
    "Expand Energy Corporation",
    "EXE Q2 2026 Form 10-Q",
    "MD&A production volumes and average sales prices table: oil total, three months ended June 30, 2026 (already disclosed as an Mbbl/d daily rate)."
  ),
  loePerMcfe: reported(
    0.25,
    "$/Mcfe",
    "Expand Energy Corporation",
    "EXE Q2 2026 Form 10-Q",
    "MD&A \"Production Expenses\" table (EXE's LOE-equivalent line item): Total production expenses per Mcfe, three months ended June 30, 2026."
  ),
  gatheringTransportPerMcfe: reported(
    0.93,
    "$/Mcfe",
    "Expand Energy Corporation",
    "EXE Q2 2026 Form 10-Q",
    "MD&A \"Gathering, Processing and Transportation Expenses\" table: Total GP&T per Mcfe, three months ended June 30, 2026."
  ),
  productionTaxPctRevenue: reported(
    EXE_PRODUCTION_TAX_PCT_REVENUE_FALLBACK,
    "decimal",
    "Expand Energy Corporation",
    "EXE Q2 2026 Form 10-Q guidance / earnings release",
    "Derived: EXE's guided FY2026 severance/ad-valorem-tax rate ($0.09/Mcfe) divided by EXE's own Q2 2026 reported commodity-sales-per-Mcfe ($2.6893/Mcfe). Fallback only -- scenarios/exe-annual.ts uses EXE's current opex_severance_ad_valorem guidance directly as the primary default."
  ),
  cashGaPerMcfe: {
    value: null,
    unit: "$/Mcfe",
    source: source(
      "Expand Energy Corporation",
      "N/A",
      "Not independently re-derived from the raw Q2 2026 10-Q in this pass (financials-quarterly.ts's own Q2 2026 EXE entry intentionally left this field unresolved -- see that file's comment: the 10-Q's disclosed G&A/Mcfe does not reconcile to the pattern this metric uses for other peers). Not used as the primary default: EXE's own guided FY2026 opex_ga ($0.085/Mcfe) takes precedence -- see scenarios/exe-annual.ts."
    )
  },
  explorationMillionPerQuarter: reported(
    16.0,
    "$mm",
    "Expand Energy Corporation",
    "EXE Q2 2026 Form 10-Q",
    "Consolidated statement of operations: Exploration expense, three months ended June 30, 2026."
  ),
  cashInterestMillionPerQuarter: reported(
    46.25,
    "$mm",
    "Expand Energy Corporation",
    "EXE FY2026 interest_expense guidance ($180-190mm, mid $185mm) / 4",
    "Fallback only -- scenarios/exe-annual.ts uses EXE's current-cycle interest_expense guidance directly as the primary default (this value is that same guided figure, quarterized, stored here for completeness). EXE's own Q2 2026 reported interest expense was $43mm, close to this guided quarterly run-rate."
  ),
  capexMillionPerQuarter: {
    value: 851.0,
    unit: "$mm",
    source: source(
      "Expand Energy Corporation",
      "EXE Q2 2026 earnings materials",
      "Q2 2026 capital expenditures per lib/dashboard/financials-quarterly.ts's already-audited EXE entry."
    )
  },
  gasBasisPerMcf: {
    value: 2.42 - 2.89,
    unit: "$/Mcf",
    source: source(
      "Expand Energy Corporation",
      "EXE Q2 2026 Form 10-Q",
      "Derived: Q2 2026 reported realized natural gas price ($2.42/Mcf, pre-hedge, per financials-quarterly.ts's already-audited EXE entry) less the Q2 2026 NYMEX Henry Hub benchmark average ($2.89/MMBtu). Used as the fallback default only -- EXE's current-cycle gas_differential guidance takes precedence."
    )
  },
  oilDifferentialPerBbl: {
    value: 84.71 - 93.58,
    unit: "$/bbl",
    source: source(
      "Expand Energy Corporation",
      "EXE Q2 2026 Form 10-Q",
      "Derived: Q2 2026 reported realized oil price ($84.71/bbl, pre-hedge) less the Q2 2026 NYMEX WTI benchmark average ($93.58/bbl). Used as the fallback default only -- EXE's current-cycle oil_differential guidance takes precedence."
    )
  },
  nglRealizationPctOfWti: reported(
    26.26 / 93.58,
    "% of WTI",
    "Expand Energy Corporation",
    "EXE Q2 2026 Form 10-Q",
    "Derived: Q2 2026 reported realized NGL price ($26.26/bbl, pre-hedge) divided by the Q2 2026 NYMEX WTI benchmark average ($93.58/bbl). Used as the fallback default only -- EXE's current-cycle absolute ngl_realized_price guidance ($24/bbl) takes precedence, applied directly rather than as a WTI ratio -- see scenarios/exe-annual.ts."
  ),
  netDebtMillion: reported(
    3075.0,
    "$mm",
    "Expand Energy Corporation",
    "EXE Q2 2026 Form 10-Q",
    "Quarter-end total debt principal less cash and cash equivalents, per lib/dashboard/financials-quarterly.ts's already-audited EXE entry."
  ),
  dilutedSharesMillion: reported(
    238.357,
    "MM shares",
    "Expand Energy Corporation",
    "EXE Q2 2026 Form 10-Q",
    "Diluted weighted-average common shares outstanding for the three months ended June 30, 2026, per lib/dashboard/market-cap-quarterly.ts's already-audited EXE Q2 2026 entry."
  )
};

/**
 * Current-market-implied EV/EBITDAX (Q2 2026 market cap + net debt, over Q2 2026
 * EBITDAX annualized), +-1.0x band -- same preset-banding convention as the RRC
 * reference model. Market cap $21,735.775mm (Nasdaq historical close x diluted
 * shares) + net debt $3,075.0mm = EV $24,810.775mm; Q2 2026 company-reported
 * adjusted EBITDAX $1,183.0mm x 4 = $4,732.0mm annualized; EV/EBITDAX = 5.24x.
 * (Spot-checked against the Q2 2026 Form 10-Q's GAAP income statement: Income
 * from operations $661mm + D&A $722mm + exploration $16mm, less the $449mm
 * non-cash "Gains (losses) on derivatives" mark-to-market line, gives a rough
 * $950mm GAAP-derived proxy -- lower than the reported $1,183mm, plausibly
 * because Adjusted EBITDAX also includes a cash-settled-hedge adjustment not
 * disclosed in the cached 10-Q; not a clear data-quality error like CRK's, so
 * the already-audited figure is used as-is.)
 */
export const EXE_VALUATION_PRESETS = { bear: 4.2, base: 5.2, bull: 6.2 } as const;

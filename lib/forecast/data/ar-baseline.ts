import type { AssumptionSource } from "@/lib/forecast/types";
import type { PeerOperatingBaseline } from "@/lib/forecast/scenarios/annual-shared";

/**
 * Source-backed AR (Antero Resources) Q2 2026 operating and financial baseline --
 * the forecast engine's "latest detailed actual" anchor, used only as the
 * reported-actual-held-flat fallback when a metric has no current or
 * carried-forward management guidance (see lib/forecast/guidance/ar.ts and
 * scenarios/ar-annual.ts for the guidance-first resolution order).
 *
 * Production/pricing/cost figures come directly from lib/dashboard/
 * financials-quarterly.ts's already-audited AR Q2 2026 entry (itself sourced to
 * AR's Q2 2026 Form 10-Q "selected operating data" table and the 2026-07-29
 * earnings release), NOT re-derived from the raw filing a second time -- this
 * integration reuses the site's existing Q2 2026 data-foundation backfill rather
 * than duplicating that audit. Net debt and diluted shares come from
 * lib/dashboard/market-cap-quarterly.ts's Q2 2026 AR entry. Interest expense was
 * independently pulled from AR's own Q2 2026 Form 10-Q (data/sec/AR/2026-06-30/
 * 0001104659-26-088153/filing.htm), since no interest-expense series exists yet
 * in the canonical dashboard dataset.
 */

const retrievedAt = "2026-08-12T00:00:00.000Z";

function source(name: string, reference: string, notes: string): AssumptionSource {
  return { name, reference, period: "Q2 2026", retrievedAt, classification: "reported", notes };
}

function reported(value: number, unit: string, name: string, reference: string, notes: string) {
  return { value, unit, source: source(name, reference, notes) };
}

// AR Q2 2026 total production was 4,144 MMcfe/d over 91 days; production tax of
// $0.10/Mcfe (embedded in the $2.38/Mcfe total cash operating cost disclosed in the
// 2026-07-29 earnings release) converts to a %-of-revenue rate as: ($0.10/Mcfe x
// 4,144 MMcfe/d x 91 days / 1000) / $1,559.842mm revenue = 2.4176%.
const AR_Q2_2026_PRODUCTION_TAX_PCT_REVENUE = 2.4176 / 100;

// AR Q2 2026 blended NGL realization ($31.06/bbl) as a percentage of the same
// quarter's NYMEX WTI benchmark average ($93.58/bbl, per Range Resources' Q2 2026
// Form 10-Q MD&A disclosure -- the same public market-wide benchmark applies to
// every company). Used only as AR's NGL pricing default because AR's own guided
// NGL differentials are quoted against Mont Belvieu ethane/C3 benchmarks that this
// system has no live feed for (see scenarios/ar-annual.ts).
const AR_Q2_2026_NGL_PCT_OF_WTI = 31.06 / 93.58;

export const arLatestDetailedBaseline: PeerOperatingBaseline = {
  ticker: "AR",
  period: "2026-Q2",
  gasMmcfPerDay: reported(
    2846.154,
    "MMcf/d",
    "Antero Resources",
    "AR Q2 2026 Form 10-Q",
    "Selected operating data table: natural gas sales volume 259 Bcf for the three months ended June 30, 2026, divided by 91 calendar days."
  ),
  nglMbblPerDay: reported(
    207.901,
    "Mbbl/d",
    "Antero Resources",
    "AR Q2 2026 Form 10-Q",
    "Selected operating data table: C2 ethane 7,896 MBbl plus C3+ NGLs 11,023 MBbl for the three months ended June 30, 2026, divided by 91 calendar days (combined-NGL convention)."
  ),
  oilMbblPerDay: reported(
    8.33,
    "Mbbl/d",
    "Antero Resources",
    "AR Q2 2026 Form 10-Q",
    "Selected operating data table: oil 758 MBbl for the three months ended June 30, 2026, divided by 91 calendar days."
  ),
  loePerMcfe: reported(
    0.13,
    "$/Mcfe",
    "Antero Resources",
    "AR Q2 2026 Form 10-Q",
    "Selected operating data table: average costs per Mcfe, lease operating, three months ended June 30, 2026."
  ),
  gatheringTransportPerMcfe: reported(
    2.03,
    "$/Mcfe",
    "Antero Resources",
    "AR Q2 2026 Form 10-Q",
    "Gathering and compression ($0.72) + processing ($0.78) + transportation ($0.49) + net marketing ($0.04, per the 2026-07-29 earnings release's cost bridge), three months ended June 30, 2026. Net marketing is grouped here as a midstream-adjacent cost rather than given its own bucket, since the engine has no separate marketing-cost field."
  ),
  productionTaxPctRevenue: reported(
    AR_Q2_2026_PRODUCTION_TAX_PCT_REVENUE,
    "decimal",
    "Antero Resources",
    "AR Q2 2026 Form 10-Q / earnings release",
    "Derived: $0.10/Mcfe production/ad valorem tax (per the 2026-07-29 earnings release's $2.38/Mcfe total cash operating cost bridge) applied to Q2 2026 production (4,144 MMcfe/d x 91 days), divided by Q2 2026 revenue ($1,559.842mm)."
  ),
  cashGaPerMcfe: reported(
    0.12,
    "$/Mcfe",
    "Antero Resources",
    "AR Q2 2026 Form 10-Q",
    "Selected operating data table: general and administrative (excluding equity-based compensation) per Mcfe, three months ended June 30, 2026. Matches AR's FY2026 opex_ga guidance midpoint exactly."
  ),
  explorationMillionPerQuarter: {
    value: 0,
    unit: "$mm",
    source: source(
      "Antero Resources",
      "AR Q2 2026 Form 10-Q",
      "AR does not present a separate exploration-expense income-statement line item (unlike RRC); costs of this nature are not independently broken out. Modeled as $0 for this bucket rather than left null, since a null value would silently zero out the entire EBITDAX/FCF calculation chain -- this is a structural difference in AR's cost presentation, not an unreported figure."
    )
  },
  cashInterestMillionPerQuarter: reported(
    19.954,
    "$mm",
    "Antero Resources",
    "AR Q2 2026 Form 10-Q",
    "Reported interest expense, net, for the three months ended June 30, 2026 (consolidated statement of operations). Used as a cash-interest proxy, held flat; not independently reconciled to cash interest paid, same convention as the RRC reference model."
  ),
  capexMillionPerQuarter: {
    value: 326.0,
    unit: "$mm",
    source: source(
      "Antero Resources",
      "AR Q2 2026 earnings materials",
      "Q2 2026 capital expenditures per lib/dashboard/financials-quarterly.ts's already-audited AR entry (basis: derived from cash-flow-statement capital spending lines)."
    )
  },
  gasBasisPerMcf: {
    value: null,
    unit: "$/Mcf",
    source: source(
      "Antero Resources",
      "N/A",
      "Not used as AR's gas-differential default: AR's own guided FY2026 differential (management guidance, +$0.05 to +$0.15/Mcf premium vs. NYMEX) takes precedence over the Q2 2026 realized print in every forecast year -- see scenarios/ar-annual.ts. AR's Q2 2026 realized gas price ($2.66/Mcf pre-hedge) was a discount to the $2.89/MMBtu NYMEX benchmark, inconsistent with the guided forward premium on a single-quarter basis (a physical-marketing-point timing/mix effect, not a forward differential); rather than reconcile that gap, this baseline intentionally does not decompose AR's realized price into a benchmark-plus-basis fallback."
    )
  },
  oilDifferentialPerBbl: {
    value: null,
    unit: "$/bbl",
    source: source(
      "Antero Resources",
      "N/A",
      "Not used as AR's oil-differential default: AR's own guided FY2026 oil differential (management guidance, -$12.00 to -$16.00/bbl vs. WTI) takes precedence in every forecast year -- see scenarios/ar-annual.ts."
    )
  },
  nglRealizationPctOfWti: reported(
    AR_Q2_2026_NGL_PCT_OF_WTI,
    "% of WTI",
    "Antero Resources",
    "AR Q2 2026 Form 10-Q",
    "Derived: Q2 2026 blended realized NGL price ($31.06/bbl, volume-weighted average of C2 ethane and C3+ NGLs, pre-hedge) divided by the Q2 2026 NYMEX WTI benchmark average ($93.58/bbl). AR guides ethane/C3 differentials against Mont Belvieu, not WTI, but this system has no live Mont Belvieu feed (only Henry Hub and WTI), so the WTI-relative ratio is used as the best available modeled default -- see scenarios/ar-annual.ts for the open item this creates."
  ),
  netDebtMillion: reported(
    2634.7,
    "$mm",
    "Antero Resources",
    "AR Q2 2026 Form 10-Q",
    "Quarter-end total debt principal less cash and cash equivalents (AR reported zero cash at quarter end), per lib/dashboard/financials-quarterly.ts's already-audited AR entry. Face-value-less-cash basis, not carrying value -- a different basis than the RRC reference model's own net-debt convention (RRC uses carrying value net of issuance costs); flagged as an open item."
  ),
  dilutedSharesMillion: reported(
    313.184,
    "MM shares",
    "Antero Resources",
    "AR Q2 2026 Form 10-Q",
    "Diluted weighted-average common shares outstanding for the three months ended June 30, 2026, per lib/dashboard/market-cap-quarterly.ts's already-audited AR Q2 2026 entry."
  )
};

/** Current-market-implied EV/EBITDAX (Q2 2026 market cap + net debt, over Q2 2026 EBITDAX annualized), +-1.0x band -- same preset-banding convention as the RRC reference model, independently computed from AR's own market data. */
export const AR_VALUATION_PRESETS = { bear: 4.7, base: 5.7, bull: 6.7 } as const;

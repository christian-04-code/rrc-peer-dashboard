import type { AssumptionSource } from "@/lib/forecast/types";
import type { PeerOperatingBaseline } from "@/lib/forecast/scenarios/annual-shared";

/**
 * Source-backed CNX (CNX Resources) Q2 2026 operating and financial baseline --
 * the forecast engine's "latest detailed actual" anchor, used only as the
 * reported-actual-held-flat fallback when a metric has no current or
 * carried-forward management guidance (see lib/forecast/guidance/cnx.ts and
 * scenarios/cnx-annual.ts for the guidance-first resolution order).
 *
 * Production/pricing/cost figures come directly from lib/dashboard/
 * financials-quarterly.ts's already-audited CNX Q2 2026 entry (itself sourced to
 * CNX's Q2 2026 Form 10-Q "average realized price reconciliation" and per-unit
 * cost tables), NOT re-derived from the raw filing a second time. Net debt and
 * diluted shares come from lib/dashboard/market-cap-quarterly.ts's Q2 2026 CNX
 * entry. Interest expense was independently pulled from CNX's own Q2 2026 Form
 * 10-Q (data/sec/CNX/2026-06-30/0001070412-26-000058/filing.htm), since no
 * interest-expense series exists yet in the canonical dashboard dataset.
 */

const retrievedAt = "2026-08-12T00:00:00.000Z";

function source(name: string, reference: string, notes: string): AssumptionSource {
  return { name, reference, period: "Q2 2026", retrievedAt, classification: "reported", notes };
}

function reported(value: number, unit: string, name: string, reference: string, notes: string) {
  return { value, unit, source: source(name, reference, notes) };
}

// CNX Q2 2026 production was 1,664.8 MMcfe/d over 91 days = 151,496.8 MMcfe. The
// $0.0432/Mcfe "production/ad valorem/other fees" component of CNX's own total
// cash-unit-cost bridge ($21,262+$6,546+$103,223+$28,012 thousand / 151,453 MMcfe
// = $1.0501/Mcfe, per the Q2 2026 10-Q) converts to a %-of-revenue rate as:
// ($6,546 thousand / 151,453 MMcfe x 151,496.8 MMcfe) / $618.484mm revenue = 1.0585%.
const CNX_Q2_2026_PRODUCTION_TAX_PCT_REVENUE = 1.0585 / 100;

export const cnxLatestDetailedBaseline: PeerOperatingBaseline = {
  ticker: "CNX",
  period: "2026-Q2",
  gasMmcfPerDay: reported(
    1497.451,
    "MMcf/d",
    "CNX Resources",
    "CNX Q2 2026 Form 10-Q",
    "Average realized price reconciliation table: natural gas sales volume 136,268 MMcf for the three months ended June 30, 2026, divided by 91 calendar days."
  ),
  nglMbblPerDay: reported(
    27.099,
    "Mbbl/d",
    "CNX Resources",
    "CNX Q2 2026 Form 10-Q",
    "Average realized price reconciliation table: NGL sales volume 2,466 MBbl for the three months ended June 30, 2026, divided by 91 calendar days."
  ),
  oilMbblPerDay: reported(
    0.714,
    "Mbbl/d",
    "CNX Resources",
    "CNX Q2 2026 Form 10-Q",
    "Average realized price reconciliation table: oil/condensate sales volume 65 MBbl for the three months ended June 30, 2026, divided by 91 calendar days."
  ),
  loePerMcfe: reported(
    0.1404,
    "$/Mcfe",
    "CNX Resources",
    "CNX Q2 2026 Form 10-Q",
    "Lease Operating Expense $21,262 thousand / total sales volumes 151,453 MMcfe, three months ended June 30, 2026."
  ),
  gatheringTransportPerMcfe: reported(
    0.6816,
    "$/Mcfe",
    "CNX Resources",
    "CNX Q2 2026 Form 10-Q",
    "Transportation, Gathering and Compression $103,223 thousand / total sales volumes 151,453 MMcfe, three months ended June 30, 2026."
  ),
  productionTaxPctRevenue: reported(
    CNX_Q2_2026_PRODUCTION_TAX_PCT_REVENUE,
    "decimal",
    "CNX Resources",
    "CNX Q2 2026 Form 10-Q",
    "Derived: $6,546 thousand production/ad valorem/other fees component of CNX's total cash-unit-cost bridge, scaled to Q2 2026 production (1,664.8 MMcfe/d x 91 days) and divided by Q2 2026 revenue ($618.484mm)."
  ),
  cashGaPerMcfe: reported(
    0.1850,
    "$/Mcfe",
    "CNX Resources",
    "CNX Q2 2026 Form 10-Q",
    "Selling, General and Administrative Costs $33,837 thousand less Long-Term Equity-Based Compensation (non-cash) $5,825 thousand = $28,012 thousand cash SG&A, / total sales volumes 151,453 MMcfe, three months ended June 30, 2026."
  ),
  explorationMillionPerQuarter: {
    value: 0,
    unit: "$mm",
    source: source(
      "CNX Resources",
      "CNX Q2 2026 Form 10-Q",
      "CNX does not present a separate exploration-expense income-statement line item (unlike RRC). Modeled as $0 for this bucket rather than left null, since a null value would silently zero out the entire EBITDAX/FCF calculation chain -- this is a structural difference in CNX's cost presentation, not an unreported figure."
    )
  },
  cashInterestMillionPerQuarter: reported(
    39.023,
    "$mm",
    "CNX Resources",
    "CNX Q2 2026 Form 10-Q",
    "Reported interest expense for the three months ended June 30, 2026 (consolidated statement of operations). Used as a cash-interest proxy, held flat; not independently reconciled to cash interest paid, same convention as the RRC reference model."
  ),
  capexMillionPerQuarter: {
    value: 142.0,
    unit: "$mm",
    source: source(
      "CNX Resources",
      "CNX Q2 2026 earnings materials",
      "Q2 2026 capital expenditures per lib/dashboard/financials-quarterly.ts's already-audited CNX entry (basis: company-reported CNX supplemental FCF reconciliation)."
    )
  },
  gasBasisPerMcf: {
    value: null,
    unit: "$/Mcf",
    source: source(
      "CNX Resources",
      "N/A",
      "Not used as CNX's gas-differential default: CNX's own guided FY2026 differential (-$0.59/MMBtu vs. NYMEX, management guidance) takes precedence in every forecast year -- see scenarios/cnx-annual.ts."
    )
  },
  oilDifferentialPerBbl: reported(
    73.74 - 93.58,
    "$/bbl",
    "CNX Resources",
    "CNX Q2 2026 Form 10-Q / RRC Q2 2026 Form 10-Q (WTI benchmark)",
    "Derived: Q2 2026 reported realized oil price ($73.74/bbl, pre-hedge) less the Q2 2026 NYMEX WTI benchmark average ($93.58/bbl, per Range Resources' Q2 2026 Form 10-Q MD&A disclosure -- the same public market-wide benchmark applies to every company). CNX does not guide an oil differential; oil is an immaterial <0.1% of CNX's total production (0.714 Mbbl/d of 1,664.8 MMcfe/d)."
  ),
  nglRealizationPctOfWti: {
    value: null,
    unit: "% of WTI",
    source: source(
      "CNX Resources",
      "N/A",
      "Not used: CNX guides an absolute FY2026 NGL price ($24.60/bbl) rather than a WTI-relative differential, which takes precedence -- see scenarios/cnx-annual.ts."
    )
  },
  netDebtMillion: reported(
    2239.488,
    "$mm",
    "CNX Resources",
    "CNX Q2 2026 Form 10-Q",
    "Quarter-end debt principal less cash and cash equivalents, per lib/dashboard/financials-quarterly.ts's already-audited CNX entry. Face-value-less-cash basis, not carrying value -- a different basis than the RRC reference model's own net-debt convention (RRC uses carrying value net of issuance costs); flagged as an open item."
  ),
  dilutedSharesMillion: reported(
    153.961273,
    "MM shares",
    "CNX Resources",
    "CNX Q2 2026 Form 10-Q",
    "Diluted weighted-average common shares outstanding for the three months ended June 30, 2026, per lib/dashboard/market-cap-quarterly.ts's already-audited CNX Q2 2026 entry."
  )
};

/** Current-market-implied EV/EBITDAX (Q2 2026 market cap + net debt, over Q2 2026 EBITDAX annualized), +-1.0x band -- same preset-banding convention as the RRC reference model, independently computed from CNX's own market data. */
export const CNX_VALUATION_PRESETS = { bear: 5.4, base: 6.4, bull: 7.4 } as const;

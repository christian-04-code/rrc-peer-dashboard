import { getCompanyGuidanceRecords, type GuidanceRecord } from "@/lib/dashboard/guidance";
import { rangeMidpoint, type GuidanceEntry, type GuidanceMetricKey, type GuidanceYear } from "@/lib/forecast/guidance/types";

/**
 * Adapter over the site's canonical, reporting-cycle-filtered management guidance
 * for CNX, mirroring guidance/rrc.ts's pattern. CNX guides production as an
 * annual Bcfe total (not a daily rate) and capex as separate D&C / non-D&C /
 * Utica-rights components that DO sum exactly to its guided total capex -- unlike
 * AR, no reconciliation is needed there. CNX's cost structure is guided only as a
 * single blended "fully_burdened_cash_cost" figure (no LOE/GP&T/G&A component
 * breakout), handled separately in scenarios/cnx-annual.ts by proportionally
 * scaling CNX's own Q2 2026 reported cost-component mix to match that guided
 * blended total, since it isn't a standard GuidanceMetricKey.
 */

const PERIOD_TO_YEAR: Record<string, GuidanceYear> = {
  "FY 2026": "2026"
};

const METRIC_MAP: Partial<Record<string, { key: GuidanceMetricKey; label: string }>> = {
  production: { key: "totalProductionBcfePerDay", label: "Total production" },
  capex: { key: "capexTotalMillion", label: "Total capital budget" },
  gas_differential: { key: "gasBasisPerMcf", label: "Natural gas differential vs. NYMEX" }
};

/** CNX guides annual FY2026 production as a Bcfe total (605-620, mid 612.5), not a daily rate -- converted here using the exact 365 days in FY 2026, matching the same convention lib/dashboard/guidance.ts's chart-facing formatter uses for this record. */
function annualBcfeToPerDay(value: number | null): number | null {
  return value === null ? null : value / 365;
}

function toGuidanceEntry(record: GuidanceRecord, mapped: { key: GuidanceMetricKey; label: string }, year: GuidanceYear): GuidanceEntry {
  const midpoint = record.midpoint ?? rangeMidpoint(record.low, record.high);
  const statusNote = record.status ? `Status: ${record.status} vs. the ${record.priorReportingCycle ?? "prior"} cycle.` : "";
  const isProduction = mapped.key === "totalProductionBcfePerDay";
  return {
    metric: mapped.key,
    label: mapped.label,
    year,
    unit: isProduction ? "Bcfe/d" : record.unit,
    low: isProduction ? annualBcfeToPerDay(record.low) : record.low,
    high: isProduction ? annualBcfeToPerDay(record.high) : record.high,
    midpoint: isProduction ? annualBcfeToPerDay(midpoint) : midpoint,
    sourceName: record.source,
    sourceReference: record.sourceLocation ?? record.source,
    sourceDate: record.sourceDate,
    notes: [record.managementWording, record.note, statusNote].filter(Boolean).join(" ")
  };
}

function buildGuidance(): GuidanceEntry[] {
  const records = getCompanyGuidanceRecords("CNX");
  const entries: GuidanceEntry[] = [];
  for (const record of records) {
    const mapped = METRIC_MAP[record.metric];
    if (!mapped) continue;
    const year = PERIOD_TO_YEAR[record.period];
    if (!year) continue; // Quarterly/component/qualitative records are not part of the standard annual table.
    entries.push(toGuidanceEntry(record, mapped, year));
  }
  return entries;
}

export const cnxManagementGuidance: GuidanceEntry[] = buildGuidance();

/** CNX's FY2026 guided absolute NGL realization ($/bbl, not a differential), used directly by scenarios/cnx-annual.ts since it's not a standard GuidanceMetricKey. Returns null if CNX stops guiding this metric. */
export function cnxGuidedNglPricePerBbl(): number | null {
  const record = getCompanyGuidanceRecords("CNX").find((entry) => entry.metric === "ngl_realized_price" && entry.period === "FY 2026");
  return record?.midpoint ?? null;
}

/** CNX's FY2026 guided blended cash-unit-cost ($/Mcfe: LOE + production/ad valorem/other fees + gathering/transport/compression + cash G&A), used by scenarios/cnx-annual.ts to proportionally scale CNX's own Q2 2026 reported cost-component mix. Returns null if CNX stops guiding this metric. */
export function cnxGuidedFullyBurdenedCashCostPerMcfe(): number | null {
  const record = getCompanyGuidanceRecords("CNX").find((entry) => entry.metric === "fully_burdened_cash_cost" && entry.period === "FY 2026");
  return record?.midpoint ?? null;
}

/**
 * CNX's own guided FY2026 NYMEX Henry Hub planning-case price assumption
 * ($3.55/MMBtu, "lowered" this cycle), used by scenarios/cnx-annual.ts as the
 * default forward Henry Hub input whenever no live market price or user override
 * is supplied -- preferred over a single realized quarter's benchmark (the Q2
 * 2026 actual, $2.89/MMBtu) because it is management's own current forward
 * planning assumption, the same precedence the RRC reference model applies to
 * pricing differentials. Returns null if CNX stops guiding this metric.
 */
export function cnxGuidedGasPriceAssumptionPerMmbtu(): number | null {
  const record = getCompanyGuidanceRecords("CNX").find((entry) => entry.metric === "gas_price_assumption" && entry.period === "FY 2026");
  return record?.midpoint ?? null;
}

/**
 * CNX's own guided annual run-rate environmental-attribute monetization
 * (~$90mm/yr, "raised" this cycle) -- a non-commodity revenue/EBITDAX
 * contribution, verified against CNX's Q2 2026 Form 10-Q: environmental
 * attribute sales are recognized within "Other Revenue and Operating Income"
 * in CNX's consolidated statement of income ($40,257 thousand for Q2 2026
 * alone), which is included in "Total Revenue and Other Operating Income"
 * ($618,484 thousand for Q2 2026 -- the same figure this engine's CNX
 * baseline already uses as its historical revenue anchor) and therefore in
 * CNX's own GAAP-based Adjusted EBITDAX bridge. This engine's forecast years
 * only project commodity (gas/NGL/oil) revenue forward, so without this
 * addback the model would structurally omit a real, guided, non-commodity
 * EBITDAX contributor every forecast year -- see scenarios/cnx-annual.ts for
 * how it's applied. Returns null if CNX stops guiding this metric.
 *
 * NOT the same as CNX's separately guided 45Z tax-credit monetization
 * (~$40mm/yr): that credit is recorded through CNX's income-tax provision
 * (an increase to income tax benefit / a reduction to cash taxes paid, per
 * the Q2 2026 10-Q's income-tax footnote), not through revenue or operating
 * income -- it is a below-EBITDAX-line item by definition (EBITDAX excludes
 * taxes) and is intentionally NOT added here.
 */
export function cnxGuidedEnvironmentalAttributeMonetizationMillionPerYear(): number | null {
  const record = getCompanyGuidanceRecords("CNX").find((entry) => entry.metric === "environmental_attribute_monetization" && entry.period === "Annual Run Rate");
  return record?.midpoint ?? null;
}

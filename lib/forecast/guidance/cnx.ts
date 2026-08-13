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

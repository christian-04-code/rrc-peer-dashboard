import { getCompanyGuidanceRecords, type GuidanceRecord } from "@/lib/dashboard/guidance";
import { rangeMidpoint, type GuidanceEntry, type GuidanceMetricKey, type GuidanceYear } from "@/lib/forecast/guidance/types";

/**
 * Adapter over the site's canonical, reporting-cycle-filtered management guidance
 * (data/management-guidance.json via lib/dashboard/guidance.ts's
 * getCompanyGuidanceRecords) for AR, mirroring guidance/rrc.ts's pattern exactly:
 * this only maps AR's canonical record metric names/periods onto the forecast
 * engine's GuidanceMetricKey shape. AR guides its own cost buckets more granularly
 * than RRC (separate opex_ga / opex_net_marketing / cash_production_expense
 * lines), and its capex total was NOT independently restated this cycle (see
 * lib/dashboard/guidance.ts's isCurrentRecord filter) -- capexTotalMillion is
 * synthesized below as a derived_guidance sum of AR's own guided components
 * (D&C maintenance + land; the "up to $200mm" discretionary growth component is
 * explicitly conditional and excluded from the default midpoint, not fabricated
 * into a forced range).
 */

const PERIOD_TO_YEAR: Record<string, GuidanceYear> = {
  "FY 2026": "2026",
  "FY 2027": "2027"
};

const METRIC_MAP: Partial<Record<string, { key: GuidanceMetricKey; label: string }>> = {
  production: { key: "totalProductionBcfePerDay", label: "Total production" },
  opex_ga: { key: "cashGaPerMcfe", label: "Cash G&A" },
  gas_differential: { key: "gasBasisPerMcf", label: "Natural gas differential vs. NYMEX" },
  oil_differential: { key: "oilDifferentialPerBbl", label: "Oil differential vs. WTI" }
};

function toGuidanceEntry(record: GuidanceRecord, mapped: { key: GuidanceMetricKey; label: string }, year: GuidanceYear): GuidanceEntry {
  const midpoint = record.midpoint ?? rangeMidpoint(record.low, record.high);
  const statusNote = record.status ? `Status: ${record.status} vs. the ${record.priorReportingCycle ?? "prior"} cycle.` : "";
  return {
    metric: mapped.key,
    label: mapped.label,
    year,
    unit: record.unit,
    low: record.low,
    high: record.high,
    midpoint,
    sourceName: record.source,
    sourceReference: record.sourceLocation ?? record.source,
    sourceDate: record.sourceDate,
    notes: [record.managementWording, record.note, statusNote].filter(Boolean).join(" ")
  };
}

/**
 * AR's FY2026 total capital budget was reaffirmed via three separate components
 * (D&C maintenance capital $1,000mm, land capital $100mm, and up to $200mm of
 * conditional discretionary growth capital) rather than restated as one figure --
 * see data/management-guidance.json's capex_dc_maintenance / capex_land /
 * capex_growth_potential entries. This sums the two committed, non-conditional
 * components into a base-case default; the discretionary growth capital is
 * explicitly "potential"/"up to", so it is not added into the default midpoint
 * (a user can still model it via a Custom capex override).
 */
function buildCapexTotalEntry(records: GuidanceRecord[]): GuidanceEntry | null {
  const maintenance = records.find((r) => r.metric === "capex_dc_maintenance" && r.period === "FY 2026");
  const land = records.find((r) => r.metric === "capex_land" && r.period === "FY 2026");
  if (!maintenance || maintenance.midpoint === null || !land || land.midpoint === null) return null;
  const midpoint = maintenance.midpoint + land.midpoint;
  return {
    metric: "capexTotalMillion",
    label: "Total capital budget (base case, excl. discretionary growth)",
    year: "2026",
    unit: "$MM",
    low: null,
    high: null,
    midpoint,
    sourceName: maintenance.source,
    sourceReference: maintenance.sourceLocation ?? maintenance.source,
    sourceDate: maintenance.sourceDate,
    notes: `derived: D&C maintenance capital ($${maintenance.midpoint}mm) + land capital ($${land.midpoint}mm) = $${midpoint}mm. Excludes up to $200mm of conditional discretionary growth capital, which management described as "potential"/"up to" rather than committed. AR's FY2026 capital budget was reaffirmed via these components rather than independently restated as a single total this cycle.`
  };
}

function buildGuidance(): GuidanceEntry[] {
  const records = getCompanyGuidanceRecords("AR");
  const entries: GuidanceEntry[] = [];
  for (const record of records) {
    const mapped = METRIC_MAP[record.metric];
    if (!mapped) continue;
    const year = PERIOD_TO_YEAR[record.period];
    if (!year) continue; // Quarterly/point-estimate/qualitative records (e.g. "Q3 2026", "YE 2026") are not part of the standard annual table.
    entries.push(toGuidanceEntry(record, mapped, year));
  }
  const capexTotal = buildCapexTotalEntry(records);
  if (capexTotal) entries.push(capexTotal);
  return entries;
}

export const arManagementGuidance: GuidanceEntry[] = buildGuidance();

import { getCompanyGuidanceRecords, type GuidanceRecord } from "@/lib/dashboard/guidance";
import { rangeMidpoint, type GuidanceEntry, type GuidanceMetricKey, type GuidanceYear } from "@/lib/forecast/guidance/types";

/**
 * Adapter over the site's canonical, reporting-cycle-filtered management guidance
 * for EQT, mirroring guidance/rrc.ts's pattern. EQT guides its FY2026 capital
 * budget as two separately-named metrics (capex_maintenance + the legacy "capex"
 * metric's "FY 2026 growth" period label) that were never restated as one total,
 * so capexTotalMillion is synthesized below as a derived_guidance sum -- the same
 * technique guidance/ar.ts uses for AR's capex total. EQT guides its full cost
 * structure component-by-component (LOE, gathering, transmission, processing,
 * production taxes, SG&A) but no gas/oil/NGL price differential this cycle.
 */

const PERIOD_TO_YEAR: Record<string, GuidanceYear> = {
  "FY 2026": "2026"
};

const METRIC_MAP: Partial<Record<string, { key: GuidanceMetricKey; label: string }>> = {
  production: { key: "totalProductionBcfePerDay", label: "Total production" },
  opex_loe: { key: "loePerMcfe", label: "Lease operating expense (LOE)" },
  opex_sga: { key: "cashGaPerMcfe", label: "Cash G&A (SG&A)" }
};

/** EQT guides production as an annual FY2026 Bcfe total (2,375-2,450, mid 2,412.5), not a daily rate -- converted here using the exact 365 days in FY 2026, the same convention used for CNX. */
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

/**
 * EQT's FY2026 capital budget was guided as two separately-named metrics this
 * cycle: capex_maintenance (period "FY 2026", $2,040-2,190mm, "lowered") and the
 * legacy "capex" metric's "FY 2026 growth" period ($580-640mm, "reaffirmed").
 * Neither was independently restated as a single total, so this sums the two
 * guided midpoints -- the same derived_guidance technique guidance/ar.ts uses.
 */
function buildCapexTotalEntry(records: GuidanceRecord[]): GuidanceEntry | null {
  const maintenance = records.find((r) => r.metric === "capex_maintenance" && r.period === "FY 2026");
  const growth = records.find((r) => r.metric === "capex" && r.period === "FY 2026 growth");
  if (!maintenance || maintenance.midpoint === null || !growth || growth.midpoint === null) return null;
  const midpoint = maintenance.midpoint + growth.midpoint;
  return {
    metric: "capexTotalMillion",
    label: "Total capital budget",
    year: "2026",
    unit: "$MM",
    low:
      maintenance.low !== null && growth.low !== null ? maintenance.low + growth.low : null,
    high:
      maintenance.high !== null && growth.high !== null ? maintenance.high + growth.high : null,
    midpoint,
    sourceName: maintenance.source,
    sourceReference: maintenance.sourceLocation ?? maintenance.source,
    sourceDate: maintenance.sourceDate,
    notes: `derived: FY2026 maintenance capital ($${maintenance.midpoint}mm) + FY2026 growth capital ($${growth.midpoint}mm) = $${midpoint}mm. EQT guides these as two separate figures rather than a single restated total this cycle.`
  };
}

/** EQT's FY2026 guided gathering + transmission + processing components, summed into this engine's single gatheringTransportPerMcfe bucket. Returns null if any component is missing from the current cycle. */
function buildGatheringTransportEntry(records: GuidanceRecord[]): GuidanceEntry | null {
  const gathering = records.find((r) => r.metric === "opex_gathering" && r.period === "FY 2026");
  const transmission = records.find((r) => r.metric === "opex_transmission" && r.period === "FY 2026");
  const processing = records.find((r) => r.metric === "opex_processing" && r.period === "FY 2026");
  if (!gathering || gathering.midpoint === null || !transmission || transmission.midpoint === null || !processing || processing.midpoint === null) return null;
  const midpoint = gathering.midpoint + transmission.midpoint + processing.midpoint;
  return {
    metric: "gatheringTransportPerMcfe",
    label: "Gathering / transmission / processing",
    year: "2026",
    unit: "$/Mcfe",
    low: null,
    high: null,
    midpoint,
    sourceName: gathering.source,
    sourceReference: gathering.sourceLocation ?? gathering.source,
    sourceDate: gathering.sourceDate,
    notes: `derived: FY2026 gathering ($${gathering.midpoint}/Mcfe) + transmission ($${transmission.midpoint}/Mcfe) + processing ($${processing.midpoint}/Mcfe) = $${midpoint.toFixed(2)}/Mcfe.`
  };
}

/** EQT's FY2026 guided production-tax rate ($/Mcfe), converted to this engine's %-of-revenue convention using EQT's own Q2 2026 reported revenue/production ratio. Returns null if EQT stops guiding this metric. */
function buildProductionTaxEntry(records: GuidanceRecord[]): GuidanceEntry | null {
  const record = records.find((r) => r.metric === "opex_production_taxes" && r.period === "FY 2026");
  if (!record || record.midpoint === null) return null;
  // $1,809.94mm Q2 2026 revenue / 634,474 MMcfe Q2 2026 production = $2.852/Mcfe average realized price; $0.07/Mcfe / $2.852/Mcfe = 2.4538%.
  const impliedPctRevenue = (record.midpoint / 2.852) * 100;
  return {
    metric: "productionTaxPerMcfe",
    label: "Production taxes",
    year: "2026",
    unit: "decimal",
    low: null,
    high: null,
    midpoint: impliedPctRevenue / 100,
    sourceName: record.source,
    sourceReference: record.sourceLocation ?? record.source,
    sourceDate: record.sourceDate,
    notes: `derived: EQT's guided FY2026 production-tax rate ($${record.midpoint}/Mcfe) converted to a %-of-revenue rate using the Q2 2026 reported revenue/production ratio ($2.852/Mcfe average realized price).`
  };
}

function buildGuidance(): GuidanceEntry[] {
  const records = getCompanyGuidanceRecords("EQT");
  const entries: GuidanceEntry[] = [];
  for (const record of records) {
    const mapped = METRIC_MAP[record.metric];
    if (!mapped) continue;
    const year = PERIOD_TO_YEAR[record.period];
    if (!year) continue; // Quarterly/component/qualitative records are not part of the standard annual table.
    entries.push(toGuidanceEntry(record, mapped, year));
  }
  const capexTotal = buildCapexTotalEntry(records);
  if (capexTotal) entries.push(capexTotal);
  const gatheringTransport = buildGatheringTransportEntry(records);
  if (gatheringTransport) entries.push(gatheringTransport);
  const productionTax = buildProductionTaxEntry(records);
  if (productionTax) entries.push(productionTax);
  return entries;
}

export const eqtManagementGuidance: GuidanceEntry[] = buildGuidance();

/** EQT's FY2026 guided total liquids sales volume (MBbl/year, NGL + ethane + oil combined), used by scenarios/eqt-annual.ts to split production between gas and liquids -- not a standard GuidanceMetricKey. Returns null if EQT stops guiding this metric. */
export function eqtGuidedLiquidsMbblPerDay(): number | null {
  const record = getCompanyGuidanceRecords("EQT").find((entry) => entry.metric === "liquids_sales_volume" && entry.period === "FY 2026");
  return record?.midpoint === undefined || record?.midpoint === null ? null : record.midpoint / 365;
}

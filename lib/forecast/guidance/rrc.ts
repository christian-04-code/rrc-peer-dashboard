import { getCompanyGuidanceRecords, type GuidanceRecord } from "@/lib/dashboard/guidance";
import { rangeMidpoint, type GuidanceEntry, type GuidanceMetricKey, type GuidanceYear } from "@/lib/forecast/guidance/types";

/**
 * Adapter over the site's canonical, reporting-cycle-filtered management guidance
 * (data/management-guidance.json via lib/dashboard/guidance.ts's getCompanyGuidanceRecords)
 * -- not a second manually transcribed guidance dataset. This module only maps the
 * canonical records' metric names and period strings ("FY 2026", "2028+", ...) onto the
 * forecast engine's GuidanceEntry shape (metric key, year, low/high/midpoint) for the
 * subset of metrics the simplified annual engine actually consumes or displays.
 *
 * Every RRC record in the canonical dataset carries reportingCycle "Q2 2026" as of this
 * integration (getCompanyGuidanceRecords already filters to the current cycle), so the
 * newest applicable guidance is used automatically -- a reaffirmed range keeps its Q2
 * status/source; an updated or raised range reflects the new Q2 numbers, never a stale
 * Q1 figure. A metric with no current-cycle record here was not guided this cycle and is
 * intentionally absent -- never fabricated.
 */

const PERIOD_TO_YEAR: Record<string, GuidanceYear> = {
  "FY 2026": "2026",
  "FY 2027": "2027",
  "2028+": "2028"
};

const METRIC_MAP: Partial<Record<string, { key: GuidanceMetricKey; label: string }>> = {
  production: { key: "totalProductionBcfePerDay", label: "Total production" },
  maintenance_production: { key: "totalProductionBcfePerDay", label: "Total production (maintenance case)" },
  capex: { key: "capexTotalMillion", label: "Total capital budget" },
  maintenance_capex: { key: "capexTotalMillion", label: "Total capital budget (maintenance case)" },
  opex_direct_operating: { key: "loePerMcfe", label: "Lease operating expense (LOE)" },
  opex_gpt: { key: "gatheringTransportPerMcfe", label: "Gathering / processing / transportation" },
  opex_ga: { key: "cashGaPerMcfe", label: "Cash G&A" },
  opex_net_interest: { key: "cashInterestPerMcfe", label: "Net interest" },
  opex_exploration_expense: { key: "explorationMillion", label: "Exploration expense" },
  opex_taxes_other_than_income: { key: "productionTaxPerMcfe", label: "Production / ad valorem taxes" },
  gas_differential: { key: "gasBasisPerMcf", label: "Natural gas differential vs. Henry Hub" },
  ngl_differential: { key: "nglDifferentialPerBbl", label: "NGL differential vs. Mont Belvieu" }
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

function buildGuidance(): GuidanceEntry[] {
  const records = getCompanyGuidanceRecords("RRC");
  const entries: GuidanceEntry[] = [];
  for (const record of records) {
    const mapped = METRIC_MAP[record.metric];
    if (!mapped) continue;
    const year = PERIOD_TO_YEAR[record.period];
    if (!year) continue; // Quarterly/qualitative/multi-year records (e.g. "Q3 2026", "2026-2027 cumulative") are not part of the standard annual table.
    entries.push(toGuidanceEntry(record, mapped, year));
  }
  return entries;
}

export const rrcManagementGuidance: GuidanceEntry[] = buildGuidance();

/**
 * Management's own Q3 2026 production point estimate (~2.4 Bcfe/d, "approximate_point_
 * estimate", new this cycle) -- not part of the standard annual GuidanceEntry table
 * (which is bucketed by year, not by quarter), but the most specific input available for
 * the 2026 H1-actual/H2-reconciled production build in rrc-annual.ts. Returns null if RRC
 * stops guiding a specific Q3 rate; the reconciliation logic falls back to an even
 * day-weighted split when this is null, never inventing a quarterly figure.
 */
export function rrcQ3_2026GuidedBcfePerDay(): number | null {
  const record = getCompanyGuidanceRecords("RRC").find((entry) => entry.metric === "production" && entry.period === "Q3 2026");
  return record?.midpoint ?? null;
}

import { getCompanyGuidanceRecords, type GuidanceRecord } from "@/lib/dashboard/guidance";
import { rangeMidpoint, type GuidanceEntry, type GuidanceMetricKey, type GuidanceYear } from "@/lib/forecast/guidance/types";

/**
 * Adapter over the site's canonical, reporting-cycle-filtered management guidance
 * for GPOR (Gulfport Energy), mirroring guidance/crk.ts's pattern. GPOR guides
 * production directly as a daily Bcfe/d rate (no unit conversion needed, unlike
 * CRK/EXE's MMcfe/d or CNX/EQT's annual-Bcfe guidance), and a combined FY2026
 * liquids (NGL + oil) sales volume plus a natural-gas-mix percentage that cross-
 * reconciles with it (1.0425 Bcfe/d total x 88.8% implied gas share vs. the
 * separately guided 89% gas mix -- see scenarios/gpor-annual.ts). GPOR guides its
 * cash cost structure component-by-component (LOE, gathering/processing/
 * transportation/compression, taxes other than income, cash G&A) plus gas/oil
 * differentials and an NGL realization guided directly as a %-of-WTI (unlike
 * CNX/EXE's absolute guided price) this cycle.
 *
 * CAPEX COMMITMENT LOGIC (see buildCapexTotalEntry below): GPOR's Q2 2026
 * earnings release explicitly labels its $140mm discretionary acreage program as
 * "additional" to the $430mm base operated capital program -- i.e. incremental,
 * not already included. This engine's default capexTotalMillion therefore maps
 * to capex_base_operated ($430mm) ONLY; the $140mm discretionary program is
 * exposed separately via gporGuidedDiscretionaryAcreageCapexMillion() below and
 * is never silently summed into the default.
 */

const PERIOD_TO_YEAR: Record<string, GuidanceYear> = {
  "FY 2026": "2026"
};

const METRIC_MAP: Partial<Record<string, { key: GuidanceMetricKey; label: string }>> = {
  production: { key: "totalProductionBcfePerDay", label: "Total production" },
  gas_differential: { key: "gasBasisPerMcf", label: "Natural gas differential vs. NYMEX" },
  oil_differential: { key: "oilDifferentialPerBbl", label: "Oil differential vs. WTI" },
  opex_loe: { key: "loePerMcfe", label: "Lease operating expense (LOE)" },
  opex_gptc: { key: "gatheringTransportPerMcfe", label: "Gathering, processing, transportation and compression" },
  opex_recurring_cash_ga: { key: "cashGaPerMcfe", label: "Recurring cash G&A" }
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
 * GPOR's FY2026 base operated capital program (capex_base_operated, ~$430mm,
 * "raised" this cycle, reportingCycle Q2 2026) is used as the default
 * capexTotalMillion -- NOT the older, superseded generic "capex" record (400-
 * 430, mid 415, reportingCycle Q1 2026, already filtered out by
 * getCompanyGuidanceRecords' current-cycle-only convention). GPOR's separately
 * guided $140mm discretionary acreage program is deliberately excluded here: per
 * the Q2 2026 earnings release ("targeting an additional $140 million during the
 * remainder of 2026"), it is explicitly incremental to, not included within, the
 * base operated program, and nothing in the current guidance indicates it is
 * committed to the base-case forecast -- so this engine does not silently
 * collapse the two into a combined default. Returns null if GPOR stops guiding
 * capex_base_operated this cycle (falls back to the reported Q2 2026 actual,
 * quarterized -- see scenarios/gpor-annual.ts).
 */
function buildCapexTotalEntry(records: GuidanceRecord[]): GuidanceEntry | null {
  const base = records.find((r) => r.metric === "capex_base_operated" && r.period === "FY 2026");
  if (!base || base.midpoint === null) return null;
  return {
    metric: "capexTotalMillion",
    label: "Total capital budget (base operated program)",
    year: "2026",
    unit: base.unit,
    low: base.low,
    high: base.high,
    midpoint: base.midpoint,
    sourceName: base.source,
    sourceReference: base.sourceLocation ?? base.source,
    sourceDate: base.sourceDate,
    notes: `${base.note ?? ""} Excludes GPOR's separately-guided $140mm discretionary acreage acquisition program, which management describes as "additional" to this base program -- not included by default; see gporGuidedDiscretionaryAcreageCapexMillion().`.trim()
  };
}

/**
 * GPOR's FY2026 guided taxes-other-than-income rate ($/Mcfe), converted to this
 * engine's %-of-revenue convention using GPOR's own Q2 2026 reported commodity-
 * sales-per-Mcfe (see gpor-baseline.ts's header note for the full derivation).
 * Returns null if GPOR stops guiding this metric.
 */
function buildProductionTaxEntry(records: GuidanceRecord[]): GuidanceEntry | null {
  const record = records.find((r) => r.metric === "opex_taxes_other_than_income" && r.period === "FY 2026");
  if (!record || record.midpoint === null) return null;
  const impliedPctRevenue = (record.midpoint / 2.9856) * 100;
  return {
    metric: "productionTaxPerMcfe",
    label: "Taxes other than income",
    year: "2026",
    unit: "decimal",
    low: null,
    high: null,
    midpoint: impliedPctRevenue / 100,
    sourceName: record.source,
    sourceReference: record.sourceLocation ?? record.source,
    sourceDate: record.sourceDate,
    notes: `derived: GPOR's guided FY2026 taxes-other-than-income rate ($${record.midpoint}/Mcfe) converted to a %-of-revenue rate using GPOR's own Q2 2026 reported commodity-sales-per-Mcfe ($2.9856/Mcfe).`
  };
}

function buildGuidance(): GuidanceEntry[] {
  const records = getCompanyGuidanceRecords("GPOR");
  const entries: GuidanceEntry[] = [];
  for (const record of records) {
    const mapped = METRIC_MAP[record.metric];
    if (!mapped) continue;
    const year = PERIOD_TO_YEAR[record.period];
    if (!year) continue; // Quarterly/component/qualitative/long-term-target records are not part of the standard annual table.
    entries.push(toGuidanceEntry(record, mapped, year));
  }
  const capexTotal = buildCapexTotalEntry(records);
  if (capexTotal) entries.push(capexTotal);
  const productionTax = buildProductionTaxEntry(records);
  if (productionTax) entries.push(productionTax);
  return entries;
}

export const gporManagementGuidance: GuidanceEntry[] = buildGuidance();

/** GPOR's FY2026 guided combined liquids (NGL + oil) sales volume (18.0-21.0 MBbl/d, mid 19.5), used by scenarios/gpor-annual.ts to split production between gas and liquids -- not a standard GuidanceMetricKey. Returns null if GPOR stops guiding this metric. */
export function gporGuidedLiquidsMbblPerDay(): number | null {
  const record = getCompanyGuidanceRecords("GPOR").find((entry) => entry.metric === "liquids_production" && entry.period === "FY 2026");
  return record?.midpoint ?? null;
}

/** GPOR's FY2026 guided NGL realization, guided directly as a %-of-WTI (40-50%, mid 45%) rather than an absolute price -- used directly by scenarios/gpor-annual.ts as nglRealizationPctOfWti (the engine's native WTI-relative field), unlike CNX/EXE's absolute guided prices. Returns null if GPOR stops guiding this metric. */
export function gporGuidedNglRealizationPctOfWti(): number | null {
  const record = getCompanyGuidanceRecords("GPOR").find((entry) => entry.metric === "ngl_realized_price" && entry.period === "FY 2026");
  return record?.midpoint === undefined || record?.midpoint === null ? null : record.midpoint / 100;
}

/**
 * GPOR's FY2026 guided discretionary acreage acquisition program ($140mm,
 * "new" this cycle) -- explicitly incremental to the base operated capital
 * program per management's own "additional" wording (see buildCapexTotalEntry
 * above), exposed here for disclosure only. NOT added to the default capex
 * total by scenarios/gpor-annual.ts. Returns null if GPOR stops guiding this
 * metric.
 */
export function gporGuidedDiscretionaryAcreageCapexMillion(): number | null {
  const record = getCompanyGuidanceRecords("GPOR").find((entry) => entry.metric === "capex_discretionary_acreage_program" && entry.period === "FY 2026");
  return record?.midpoint ?? null;
}

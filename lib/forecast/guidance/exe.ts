import { getCompanyGuidanceRecords, type GuidanceRecord } from "@/lib/dashboard/guidance";
import { rangeMidpoint, type GuidanceEntry, type GuidanceMetricKey, type GuidanceYear } from "@/lib/forecast/guidance/types";

/**
 * Adapter over the site's canonical, reporting-cycle-filtered management guidance
 * for EXE (Expand Energy), mirroring guidance/crk.ts's pattern. EXE guides
 * production as a daily MMcfe/d rate (already this engine's per-day convention,
 * unlike CNX/EQT's annual-Bcfe guidance -- still requires the /1000 MMcfe-to-Bcfe
 * unit conversion CRK also needs). EXE guides its cash cost structure component-
 * by-component (production expense, gathering/processing/transportation split
 * into a base rate plus a separate fair-value-liability adjustment, severance/ad
 * valorem taxes, G&A) plus gas/oil differentials and an absolute NGL realization
 * price this cycle, and a total FY2026 cash-interest dollar figure (not a
 * standard GuidanceMetricKey, read directly via getCompanyGuidanceRecords below,
 * mirroring guidance/crk.ts's crkGuidedCashInterestMillion extension technique).
 * EXE does not guide a cash-tax rate this cycle.
 *
 * KNOWN FIX PRESERVED: EXE's FY2026 production guidance midpoint is 7,500
 * MMcfe/d (7,400-7,600), the corrected value from the prior data-foundation
 * pass -- this file reads it directly from data/management-guidance.json's
 * current Q2 2026 cycle record via getCompanyGuidanceRecords, so it cannot
 * silently regress to the old malformed value.
 */

const PERIOD_TO_YEAR: Record<string, GuidanceYear> = {
  "FY 2026": "2026"
};

const METRIC_MAP: Partial<Record<string, { key: GuidanceMetricKey; label: string }>> = {
  production: { key: "totalProductionBcfePerDay", label: "Total production" },
  capex: { key: "capexTotalMillion", label: "Total capital budget" },
  gas_differential: { key: "gasBasisPerMcf", label: "Natural gas differential vs. NYMEX" },
  oil_differential: { key: "oilDifferentialPerBbl", label: "Oil differential vs. WTI" },
  opex_production_expense: { key: "loePerMcfe", label: "Production expense (LOE-equivalent)" },
  opex_ga: { key: "cashGaPerMcfe", label: "Cash G&A" }
};

/** EXE guides production as a daily MMcfe/d rate (7,400-7,600, mid 7,500), but this engine's totalProductionBcfePerDay key is denominated in Bcfe/d (matching EQT/CNX's converted-to-daily-Bcfe convention) -- converted here by dividing by 1,000. Same conversion technique as guidance/crk.ts. */
function mmcfeToBcfe(value: number | null): number | null {
  return value === null ? null : value / 1000;
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
    low: isProduction ? mmcfeToBcfe(record.low) : record.low,
    high: isProduction ? mmcfeToBcfe(record.high) : record.high,
    midpoint: isProduction ? mmcfeToBcfe(midpoint) : midpoint,
    sourceName: record.source,
    sourceReference: record.sourceLocation ?? record.source,
    sourceDate: record.sourceDate,
    notes: [record.managementWording, record.note, statusNote].filter(Boolean).join(" ")
  };
}

/**
 * EXE's FY2026 guided gathering/processing/transportation ($/Mcfe) is split into
 * a base rate (opex_gpt, $0.95-1.05, mid $1.00) and a separate fair-value-
 * liability adjustment (opex_gpt_fmv_liability, $0.06-0.08, mid $0.07) -- summed
 * here into this engine's single gatheringTransportPerMcfe bucket, the same
 * multi-component-sum technique guidance/eqt.ts uses for EQT's gathering +
 * transmission + processing components. Returns null if either component is
 * missing from the current cycle.
 */
function buildGatheringTransportEntry(records: GuidanceRecord[]): GuidanceEntry | null {
  const base = records.find((r) => r.metric === "opex_gpt" && r.period === "FY 2026");
  const fmv = records.find((r) => r.metric === "opex_gpt_fmv_liability" && r.period === "FY 2026");
  if (!base || base.midpoint === null || !fmv || fmv.midpoint === null) return null;
  const midpoint = base.midpoint + fmv.midpoint;
  return {
    metric: "gatheringTransportPerMcfe",
    label: "Gathering, processing and transportation",
    year: "2026",
    unit: "$/Mcfe",
    low: base.low !== null && fmv.low !== null ? base.low + fmv.low : null,
    high: base.high !== null && fmv.high !== null ? base.high + fmv.high : null,
    midpoint,
    sourceName: base.source,
    sourceReference: base.sourceLocation ?? base.source,
    sourceDate: base.sourceDate,
    notes: `derived: FY2026 gathering/processing/transportation base rate ($${base.midpoint}/Mcfe) + fair-value-liability adjustment ($${fmv.midpoint}/Mcfe) = $${midpoint.toFixed(2)}/Mcfe.`
  };
}

/**
 * EXE's FY2026 guided severance/ad-valorem-tax rate ($/Mcfe), converted to this
 * engine's %-of-revenue convention using EXE's own Q2 2026 reported commodity-
 * sales-per-Mcfe. Returns null if EXE stops guiding this metric.
 */
function buildProductionTaxEntry(records: GuidanceRecord[]): GuidanceEntry | null {
  const record = records.find((r) => r.metric === "opex_severance_ad_valorem" && r.period === "FY 2026");
  if (!record || record.midpoint === null) return null;
  // $1,830mm Q2 2026 "Natural gas, oil and NGL" sales / 680,498 MMcfe Q2 2026 production = $2.6893/Mcfe.
  const impliedPctRevenue = (record.midpoint / 2.6893) * 100;
  return {
    metric: "productionTaxPerMcfe",
    label: "Severance and ad valorem taxes",
    year: "2026",
    unit: "decimal",
    low: null,
    high: null,
    midpoint: impliedPctRevenue / 100,
    sourceName: record.source,
    sourceReference: record.sourceLocation ?? record.source,
    sourceDate: record.sourceDate,
    notes: `derived: EXE's guided FY2026 severance/ad-valorem-tax rate ($${record.midpoint}/Mcfe) converted to a %-of-revenue rate using EXE's own Q2 2026 reported commodity-sales-per-Mcfe ($2.6893/Mcfe).`
  };
}

function buildGuidance(): GuidanceEntry[] {
  const records = getCompanyGuidanceRecords("EXE");
  const entries: GuidanceEntry[] = [];
  for (const record of records) {
    const mapped = METRIC_MAP[record.metric];
    if (!mapped) continue;
    const year = PERIOD_TO_YEAR[record.period];
    if (!year) continue; // Quarterly/component/qualitative/long-term-target records are not part of the standard annual table.
    entries.push(toGuidanceEntry(record, mapped, year));
  }
  const gatheringTransport = buildGatheringTransportEntry(records);
  if (gatheringTransport) entries.push(gatheringTransport);
  const productionTax = buildProductionTaxEntry(records);
  if (productionTax) entries.push(productionTax);
  return entries;
}

export const exeManagementGuidance: GuidanceEntry[] = buildGuidance();

/** EXE's FY2026 guided total cash-interest expense ($180-190mm, mid $185mm), used by scenarios/exe-annual.ts as a total-dollar figure -- not a standard GuidanceMetricKey. Returns null if EXE stops guiding this metric. */
export function exeGuidedInterestExpenseMillion(): number | null {
  const record = getCompanyGuidanceRecords("EXE").find((entry) => entry.metric === "interest_expense" && entry.period === "FY 2026");
  return record?.midpoint ?? null;
}

/** EXE's FY2026 guided absolute NGL realization ($22-26/bbl, mid $24/bbl), used directly by scenarios/exe-annual.ts (as nglMarketingUpliftPerBbl, the same technique guidance/cnx.ts uses for CNX's absolute NGL price) since it's not a standard GuidanceMetricKey. Returns null if EXE stops guiding this metric. */
export function exeGuidedNglPricePerBbl(): number | null {
  const record = getCompanyGuidanceRecords("EXE").find((entry) => entry.metric === "ngl_realized_price" && entry.period === "FY 2026");
  return record?.midpoint ?? null;
}

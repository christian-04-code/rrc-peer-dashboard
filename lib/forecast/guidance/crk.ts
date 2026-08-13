import { getCompanyGuidanceRecords, type GuidanceRecord } from "@/lib/dashboard/guidance";
import { rangeMidpoint, type GuidanceEntry, type GuidanceMetricKey, type GuidanceYear } from "@/lib/forecast/guidance/types";

/**
 * Adapter over the site's canonical, reporting-cycle-filtered management guidance
 * for CRK (Comstock Resources), mirroring guidance/eqt.ts's pattern. CRK guides
 * production and capex as a per-day MMcfe/d rate and a $MM total respectively
 * (already the units this engine's standard metric keys expect -- no annual-to-
 * daily conversion needed, unlike CNX/EQT). CRK guides its cash cost structure
 * component-by-component (LOE, gathering/transportation, production/other taxes,
 * cash G&A) but no gas or oil price/differential this cycle. CRK also guides a
 * total FY2026 cash-interest dollar figure and an effective-tax-rate/deferred-
 * tax-percentage pair (not a standard GuidanceMetricKey for either), both read
 * directly via getCompanyGuidanceRecords below, mirroring guidance/eqt.ts's
 * eqtGuidedLiquidsMbblPerDay extension technique.
 */

const PERIOD_TO_YEAR: Record<string, GuidanceYear> = {
  "FY 2026": "2026"
};

const METRIC_MAP: Partial<Record<string, { key: GuidanceMetricKey; label: string }>> = {
  production: { key: "totalProductionBcfePerDay", label: "Total production" },
  capex: { key: "capexTotalMillion", label: "Total capital budget" },
  opex_loe: { key: "loePerMcfe", label: "Lease operating expense (LOE)" },
  opex_gathering_transportation: { key: "gatheringTransportPerMcfe", label: "Gathering and transportation" }
};

/** CRK guides production as a daily MMcfe/d rate (1,250-1,400, mid 1,325), but this engine's totalProductionBcfePerDay key is denominated in Bcfe/d (matching EQT/CNX's converted-to-daily-Bcfe convention) -- converted here by dividing by 1,000. */
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
 * CRK's FY2026 guided production-tax rate ($/Mcfe, opex_production_other_taxes),
 * converted to this engine's %-of-revenue convention using CRK's own Q2 2026
 * reported natural-gas-and-oil-sales-per-Mcfe -- deliberately not CRK's blended
 * "Total revenues and other operating income" line, which includes CRK's separate
 * Gas Services (midstream) revenue and is not comparable to this engine's
 * commodity-only revenue basis (see data/crk-baseline.ts's header note for the
 * full derivation and the unrelated revenue-field data-quality flag it documents).
 * Returns null if CRK stops guiding this metric.
 */
function buildProductionTaxEntry(records: GuidanceRecord[]): GuidanceEntry | null {
  const record = records.find((r) => r.metric === "opex_production_other_taxes" && r.period === "FY 2026");
  if (!record || record.midpoint === null) return null;
  // $288.221mm Q2 2026 natural gas + oil sales / 113,101.99 MMcfe Q2 2026 production = $2.5483/Mcfe.
  const impliedPctRevenue = (record.midpoint / 2.5483) * 100;
  return {
    metric: "productionTaxPerMcfe",
    label: "Production and other taxes",
    year: "2026",
    unit: "decimal",
    low: null,
    high: null,
    midpoint: impliedPctRevenue / 100,
    sourceName: record.source,
    sourceReference: record.sourceLocation ?? record.source,
    sourceDate: record.sourceDate,
    notes: `derived: CRK's guided FY2026 production-tax rate ($${record.midpoint}/Mcfe) converted to a %-of-revenue rate using CRK's own Q2 2026 reported natural-gas-and-oil-sales-per-Mcfe ($2.5483/Mcfe).`
  };
}

/**
 * CRK's guided cash G&A is a total FY2026 dollar figure (opex_cash_ga, $38-40mm,
 * mid $39mm), not a $/Mcfe rate. Converted here using CRK's guided FY2026 total
 * production (1,250-1,400 MMcfe/d, mid 1,325) x 365 days, the same "guided total
 * over guided production" technique used elsewhere in this engine to reconcile a
 * dollar-total guidance figure with a $/Mcfe-denominated engine field. Returns
 * null if CRK stops guiding either metric this cycle.
 */
function buildCashGaEntry(records: GuidanceRecord[]): GuidanceEntry | null {
  const gaRecord = records.find((r) => r.metric === "opex_cash_ga" && r.period === "FY 2026");
  const productionRecord = records.find((r) => r.metric === "production" && r.period === "FY 2026");
  if (!gaRecord || gaRecord.midpoint === null || !productionRecord || productionRecord.midpoint === null) return null;
  const guidedAnnualMcfe = productionRecord.midpoint * 365;
  const perMcfe = (gaRecord.midpoint * 1_000_000) / (guidedAnnualMcfe * 1000);
  return {
    metric: "cashGaPerMcfe",
    label: "Cash G&A",
    year: "2026",
    unit: "$/Mcfe",
    low: null,
    high: null,
    midpoint: perMcfe,
    sourceName: gaRecord.source,
    sourceReference: gaRecord.sourceLocation ?? gaRecord.source,
    sourceDate: gaRecord.sourceDate,
    notes: `derived: CRK's guided FY2026 cash G&A ($${gaRecord.midpoint}mm total) divided by CRK's guided FY2026 total production (${productionRecord.midpoint} MMcfe/d x 365 days = ${guidedAnnualMcfe.toFixed(0)} MMcfe) = $${perMcfe.toFixed(4)}/Mcfe.`
  };
}

/**
 * CRK guides an effective tax rate (22-24%, mid 23%) and a deferred-tax
 * percentage of that rate (98-100%, mid 99%) separately, rather than a direct
 * cash-tax rate. The cash-tax portion is the non-deferred remainder: 23% x
 * (1 - 99%) = 0.23%. Returns null if either component is missing this cycle.
 */
function buildCashTaxRateEntry(records: GuidanceRecord[]): GuidanceEntry | null {
  const effective = records.find((r) => r.metric === "effective_tax_rate" && r.period === "FY 2026");
  const deferred = records.find((r) => r.metric === "deferred_tax_pct" && r.period === "FY 2026");
  if (!effective || effective.midpoint === null || !deferred || deferred.midpoint === null) return null;
  const cashRate = (effective.midpoint / 100) * (1 - deferred.midpoint / 100);
  return {
    metric: "cashTaxRate",
    label: "Cash tax rate",
    year: "2026",
    unit: "decimal",
    low: null,
    high: null,
    midpoint: cashRate,
    sourceName: effective.source,
    sourceReference: effective.sourceLocation ?? effective.source,
    sourceDate: effective.sourceDate,
    notes: `derived: CRK's guided FY2026 effective tax rate (${effective.midpoint}%) x (1 - guided deferred-tax share (${deferred.midpoint}%)) = ${(cashRate * 100).toFixed(4)}% cash tax rate.`
  };
}

function buildGuidance(): GuidanceEntry[] {
  const records = getCompanyGuidanceRecords("CRK");
  const entries: GuidanceEntry[] = [];
  for (const record of records) {
    const mapped = METRIC_MAP[record.metric];
    if (!mapped) continue;
    const year = PERIOD_TO_YEAR[record.period];
    if (!year) continue; // Quarterly/component/qualitative records are not part of the standard annual table.
    entries.push(toGuidanceEntry(record, mapped, year));
  }
  const productionTax = buildProductionTaxEntry(records);
  if (productionTax) entries.push(productionTax);
  const cashGa = buildCashGaEntry(records);
  if (cashGa) entries.push(cashGa);
  const cashTaxRate = buildCashTaxRateEntry(records);
  if (cashTaxRate) entries.push(cashTaxRate);
  return entries;
}

export const crkManagementGuidance: GuidanceEntry[] = buildGuidance();

/** CRK's FY2026 guided total cash-interest expense ($228-232mm, mid $230mm), used by scenarios/crk-annual.ts as a total-dollar figure -- not a standard GuidanceMetricKey (which only has a $/Mcfe cash-interest key). Returns null if CRK stops guiding this metric. */
export function crkGuidedCashInterestMillion(): number | null {
  const record = getCompanyGuidanceRecords("CRK").find((entry) => entry.metric === "cash_interest" && entry.period === "FY 2026");
  return record?.midpoint ?? null;
}

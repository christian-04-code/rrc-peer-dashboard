import managementGuidanceData from "@/data/management-guidance.json";
import type { Ticker } from "./company-registry";

export type GuidanceRecord = {
  company: Ticker;
  metric: string;
  period: string;
  plotPeriod: string;
  low: number | null;
  midpoint: number | null;
  high: number | null;
  unit: string;
  guidanceType: string;
  source: string;
  sourceUrl?: string;
  sourceDate: string;
  sourceLocation?: string;
  reportingCycle?: string;
  priorReportingCycle?: string;
  status?: string;
  operator?: string;
  reportedValue?: number;
  managementWording?: string;
  note?: string;
  chartable: boolean;
};

type ManagementGuidanceFile = {
  meta: {
    auditAsOf: string;
    note: string;
    reportingCycle: string;
    ingestionSource?: string;
  };
  companies: Record<string, { entries: GuidanceRecord[] }>;
};

const data = managementGuidanceData as ManagementGuidanceFile;
const MAX_TOTAL = 6;

const SECTION_ORDER = [
  "Production",
  "Capital Expenditures",
  "Cash Flow & Earnings",
  "Debt & Leverage",
  "Operating Costs & Pricing",
  "Wells & Development",
  "Infrastructure & Commercial",
  "Other"
];

export type GuidanceHighlight = {
  section: string;
  label: string;
  value: string;
  status?: string;
};

export type GuidanceRow =
  | { kind: "pair"; label: string; value: string; detail?: string }
  | { kind: "note"; text: string; detail?: string };

export type GuidanceSectionData = { section: string; rows: GuidanceRow[] };

export type GuidanceDrawerContent = {
  kind: "guidance";
  ticker: string;
  sections: GuidanceSectionData[];
  meta: { source: string; generated: string };
};

function isCurrentRecord(record: GuidanceRecord): boolean {
  if (record.reportingCycle !== data.meta.reportingCycle) return false;
  // Q2 AR materials reaffirmed three components but did not independently restate a total.
  return !(record.company === "AR" && record.metric === "capex" && record.note?.includes("not independently restated"));
}

function currentRecords(ticker: Ticker): GuidanceRecord[] {
  return (data.companies[ticker]?.entries ?? []).filter(isCurrentRecord);
}

/**
 * Raw structured guidance records (low/high/midpoint/unit/period/status/managementWording),
 * filtered to the current reporting cycle -- the canonical source for anything that needs
 * numeric guidance data rather than display-formatted strings (e.g. the forecast engine's
 * guidance adapter at lib/forecast/guidance/rrc.ts). Reuses the same isCurrentRecord/
 * currentRecords filtering as the rest of this module so a consumer never sees a stale
 * cycle's row without also seeing the highlight/section views built from the same data.
 */
export function getCompanyGuidanceRecords(ticker: Ticker): GuidanceRecord[] {
  return currentRecords(ticker);
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/Fcf/g, "FCF")
    .replace(/Ebitdax/g, "EBITDAX")
    .replace(/Capex/g, "CapEx")
    .replace(/Loe/g, "LOE")
    .replace(/Gptc?/g, (match) => match.toUpperCase())
    .replace(/Dc\b/g, "D&C")
    .replace(/Ga\b/g, "G&A");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
}

function formatValue(value: number, unit: string): string {
  if (unit === "$MM") return `$${formatNumber(value)}MM`;
  return `${formatNumber(value)}${unit === "%" ? "%" : ` ${unit}`}`;
}

function operatorSymbol(operator: string): string {
  return operator === ">=" ? "≥" : operator === "<=" ? "≤" : operator;
}

function formattedRecordValue(record: GuidanceRecord): string {
  if (record.operator) {
    const threshold = record.reportedValue ?? record.midpoint ?? record.high ?? record.low;
    if (threshold !== null && threshold !== undefined) {
      return `${operatorSymbol(record.operator)}${formatValue(threshold, record.unit)}`;
    }
  }
  if (record.low !== null && record.high !== null) {
    if (record.unit === "$MM") return `$${formatNumber(record.low)}–$${formatNumber(record.high)}MM`;
    return `${formatNumber(record.low)}–${formatNumber(record.high)} ${record.unit}`;
  }
  const point = record.midpoint ?? record.reportedValue ?? record.high ?? record.low;
  if (point !== null && point !== undefined) {
    const prefix = record.guidanceType.includes("approximate") ? "~" : "";
    return `${prefix}${formatValue(point, record.unit)}`;
  }
  return record.managementWording ?? record.note ?? "Qualitative guidance";
}

function sectionFor(record: GuidanceRecord): string {
  const metric = record.metric;
  if (/production|liquids|curtailment/.test(metric)) return "Production";
  if (/capex|capital|acreage/.test(metric)) return "Capital Expenditures";
  if (/fcf|ebitda|ebitdax|cash_flow|tax|interest/.test(metric)) return "Cash Flow & Earnings";
  if (/debt|leverage/.test(metric)) return "Debt & Leverage";
  if (/opex|cost|expense|differential|price|breakeven|margin/.test(metric)) return "Operating Costs & Pricing";
  if (/well|til|lateral|rig|frac|completion|proppant|development/.test(metric)) return "Wells & Development";
  if (/capacity|takeaway|lng|midstream|pipeline|offtake|commercial|supply|infrastructure|twin_eagle|pinnacle|mvp/.test(metric)) return "Infrastructure & Commercial";
  return "Other";
}

function recordLabel(record: GuidanceRecord): string {
  return `${titleCase(record.metric)} · ${record.period}`;
}

function recordDetail(record: GuidanceRecord): string {
  const location = record.sourceLocation ? `${record.sourceLocation} · ` : "";
  const status = record.status ? ` · ${titleCase(record.status)}` : "";
  return `${record.source} · ${location}${record.sourceDate}${status}`;
}

function highlightRank(record: GuidanceRecord): number {
  const ranks: Record<string, number> = {
    production: 0,
    capex: 10,
    capex_base_operated: 11,
    capex_dc: 12,
    capex_dc_maintenance: 12,
    capex_discretionary_acreage_program: 13,
    fcf: 20,
    ebitdax: 21,
    net_debt_target: 30,
    debt_target: 31,
    leverage_target: 32,
    opex_total: 40,
    cash_operating_cost_target: 41,
    opex_loe: 42,
    gas_differential: 43
  };
  const metricRank = ranks[record.metric] ?? 100;
  const periodRank = record.period === "FY 2026" ? 0 : record.period.startsWith("Q3 2026") ? 1 : record.period.startsWith("Q4 2026") ? 2 : 3;
  return metricRank + periodRank / 10;
}

export function hasGuidance(ticker: Ticker): boolean {
  return currentRecords(ticker).length > 0;
}

export function getGuidanceMeta(): { source: string; generated: string } {
  return {
    source: `Official company disclosures · ${data.meta.reportingCycle} cycle`,
    generated: data.meta.auditAsOf
  };
}

/** Highest-value current-cycle items for the compact right-side widget. */
export function getCompanyGuidanceHighlights(ticker: Ticker): GuidanceHighlight[] {
  return currentRecords(ticker)
    .slice()
    .sort((left, right) => highlightRank(left) - highlightRank(right))
    .slice(0, MAX_TOTAL)
    .map((record) => ({
      section: sectionFor(record),
      label: recordLabel(record),
      value: formattedRecordValue(record),
      status: record.status ? titleCase(record.status) : undefined
    }));
}

/** Full current-cycle guidance text retained for non-drawer consumers. */
export function getCompanyGuidanceFullText(ticker: Ticker): string {
  return currentRecords(ticker)
    .map((record) => `${recordLabel(record)}: ${formattedRecordValue(record)} · ${recordDetail(record)}`)
    .join(" · ") || `No current ${data.meta.reportingCycle} management guidance is available for ${ticker}.`;
}

/** Full current-cycle guidance, including non-chartable records, grouped for the detail drawer. */
export function getCompanyGuidanceSections(ticker: Ticker): GuidanceSectionData[] {
  const grouped = new Map<string, GuidanceRow[]>();
  for (const record of currentRecords(ticker)) {
    const section = sectionFor(record);
    const rows = grouped.get(section) ?? [];
    rows.push({
      kind: "pair",
      label: recordLabel(record),
      value: formattedRecordValue(record),
      detail: recordDetail(record)
    });
    grouped.set(section, rows);
  }

  return SECTION_ORDER
    .filter((section) => grouped.has(section))
    .map((section) => ({ section, rows: grouped.get(section) ?? [] }));
}

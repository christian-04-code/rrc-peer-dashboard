import { getQuarterlyFinancials, quarters, type Quarter, type SourcedValue } from "@/lib/dashboard/financials-quarterly";
import { getQuarterlyFreeCashFlow } from "@/lib/dashboard/free-cash-flow-quarterly";
import { getNetDebtToLtmAdjustedEbitdax, getRealizedPricePerMcfe, getCapexPerMcfe } from "@/lib/dashboard/calculated-quarterly";
import { getCompanyGuidanceRecords, type GuidanceRecord } from "@/lib/dashboard/guidance";
import { compareQuarterly } from "@/lib/reports/comparisons";
import type { SourceManifestEntry, WeeklyEvidenceItem } from "@/lib/reports/weekly-report-types";

/**
 * Range's own quarterly financial/operating results + management guidance
 * (category "range_company", Phase 7B decision -- see the architecture
 * doc's "why range_company is separate from peers" note). Distinct from
 * adapters/peers-adapter.ts, which covers comparative peer-company
 * positioning on the same underlying quarterly fixture.
 *
 * Data source: lib/dashboard/financials-quarterly.ts's static, extracted,
 * SourcedValue-tagged fixture (Codex/FactSet/SEC-direct, see that file's own
 * header) -- a pure synchronous read, no fetch/DB call. This fixture updates
 * only when a new quarter's results are manually extracted into the repo
 * (roughly once per quarter), NOT weekly -- which is exactly why every
 * comparison below is QoQ/priorQuarterActuals (via compareQuarterly), never
 * WoW/MoM: a weekly cron re-observing the same latest quarter for many
 * consecutive weeks is expected and correct, not evidence of missing data.
 */

const TICKER = "RRC" as const;
const LATEST_QUARTER: Quarter = quarters[quarters.length - 1];

/** Calibrated against lib/market/macro-analytics.ts's own monthly (50/120 day) and annual (400/800 day) freshness bands -- quarterly falls between the two, generously accounting for the ~30-45 day typical post-quarter-end earnings-release lag on top of the ~90 day quarter itself. */
const QUARTER_CURRENT_AGE_DAYS = 110;
const QUARTER_LAGGED_AGE_DAYS = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

const QUARTER_END: Record<string, [number, number]> = { Q1: [3, 31], Q2: [6, 30], Q3: [9, 30], Q4: [12, 31] };

function quarterEndDate(quarter: Quarter): Date | null {
  const [q, year] = quarter.split(" ");
  const spec = QUARTER_END[q];
  if (!spec || !year) return null;
  return new Date(Date.UTC(Number(year), spec[0] - 1, spec[1]));
}

function quarterFreshness(quarter: Quarter, now: Date): "current" | "lagged" | "stale" | "unavailable" {
  const end = quarterEndDate(quarter);
  if (!end) return "unavailable";
  const ageDays = Math.max(0, (now.getTime() - end.getTime()) / DAY_MS);
  if (ageDays <= QUARTER_CURRENT_AGE_DAYS) return "current";
  return ageDays <= QUARTER_LAGGED_AGE_DAYS ? "lagged" : "stale";
}

function sourceLabel(value: SourcedValue): string {
  return `${value.source} (${value.basis})`;
}

type MetricSpec = {
  metricKey: string;
  label: string;
  unit: string;
  driver: string;
  getValue: (quarter: Quarter) => SourcedValue | undefined;
  displayValue: (value: number | null) => string;
};

function moneyDisplay(value: number | null): string {
  return value === null ? "--" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}MM`;
}
function countDisplay(unit: string) {
  return (value: number | null) => (value === null ? "--" : `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${unit}`);
}
function multipleDisplay(value: number | null): string {
  return value === null ? "--" : `${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`;
}
function perMcfeDisplay(value: number | null): string {
  return value === null ? "--" : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/Mcfe`;
}

const METRICS: MetricSpec[] = [
  { metricKey: "revenue", label: "RRC Revenue", unit: "$MM", driver: "gas_pricing", getValue: (q) => getQuarterlyFinancials(TICKER, q).revenue, displayValue: moneyDisplay },
  { metricKey: "adjusted_ebitdax", label: "RRC Adjusted EBITDAX", unit: "$MM", driver: "gas_pricing", getValue: (q) => getQuarterlyFinancials(TICKER, q).adjustedEbitdax, displayValue: moneyDisplay },
  { metricKey: "capital_expenditures", label: "RRC Capital Expenditures", unit: "$MM", driver: "gas_pricing", getValue: (q) => getQuarterlyFinancials(TICKER, q).capitalExpenditures, displayValue: moneyDisplay },
  { metricKey: "net_debt", label: "RRC Net Debt", unit: "$MM", driver: "gas_pricing", getValue: (q) => getQuarterlyFinancials(TICKER, q).netDebt, displayValue: moneyDisplay },
  { metricKey: "production_total", label: "RRC Total Production", unit: "MMcfe/d", driver: "us_gas_supply", getValue: (q) => getQuarterlyFinancials(TICKER, q).production.total, displayValue: countDisplay("MMcfe/d") },
  { metricKey: "free_cash_flow", label: "RRC Free Cash Flow", unit: "$MM", driver: "gas_pricing", getValue: (q) => getQuarterlyFreeCashFlow(TICKER, q), displayValue: moneyDisplay },
  { metricKey: "net_debt_to_ltm_ebitdax", label: "RRC Net Debt / LTM EBITDAX", unit: "x", driver: "gas_pricing", getValue: (q) => getNetDebtToLtmAdjustedEbitdax(TICKER, q), displayValue: multipleDisplay },
  { metricKey: "realized_price_per_mcfe", label: "RRC Realized Price / Mcfe", unit: "$/Mcfe", driver: "gas_pricing", getValue: (q) => getRealizedPricePerMcfe(TICKER, q), displayValue: perMcfeDisplay },
  { metricKey: "capex_per_mcfe", label: "RRC CapEx / Mcfe", unit: "$/Mcfe", driver: "gas_pricing", getValue: (q) => getCapexPerMcfe(TICKER, q), displayValue: perMcfeDisplay }
];

function guidanceEvidenceId(record: GuidanceRecord): string {
  return `range_company:guidance:${record.company}:${record.metric}:${record.period}`;
}

export type RangeCompanyCollection = {
  items: WeeklyEvidenceItem[];
  manifestEntries: SourceManifestEntry[];
  present: boolean;
};

export function collectRangeCompanyEvidence(now = new Date()): RangeCompanyCollection {
  const freshness = quarterFreshness(LATEST_QUARTER, now);
  const items: WeeklyEvidenceItem[] = [];

  for (const spec of METRICS) {
    const sourced = spec.getValue(LATEST_QUARTER);
    const value = sourced?.value ?? null;
    items.push({
      evidenceId: `range_company:rrc:${spec.metricKey}`,
      category: "range_company",
      metricKey: spec.metricKey,
      label: spec.label,
      currentValue: value,
      displayValue: spec.displayValue(value),
      unit: spec.unit,
      period: LATEST_QUARTER,
      asOfDate: quarterEndDate(LATEST_QUARTER)?.toISOString().slice(0, 10) ?? null,
      sourceIds: ["range_company_financials"],
      freshness,
      comparisons: value === null ? [] : compareQuarterly(spec.metricKey, spec.label, LATEST_QUARTER, spec.getValue),
      rangeDrivers: [spec.driver],
      materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
      metadata: sourced ? { source: sourceLabel(sourced), note: sourced.note ?? null } : { source: null }
    });
  }

  const guidanceRecords = getCompanyGuidanceRecords(TICKER);
  for (const record of guidanceRecords) {
    items.push({
      evidenceId: guidanceEvidenceId(record),
      category: "range_company",
      metricKey: `guidance:${record.metric}`,
      label: `RRC Guidance: ${record.metric} (${record.period})`,
      currentValue: record.midpoint ?? record.reportedValue ?? null,
      displayValue: [record.low, record.midpoint, record.high].every((v) => v === null) ? (record.managementWording ?? record.note ?? "Qualitative guidance") : `${record.low ?? "--"}-${record.high ?? "--"} ${record.unit}`.trim(),
      unit: record.unit,
      period: record.period,
      asOfDate: /^\d{4}-\d{2}-\d{2}$/.test(record.sourceDate) ? record.sourceDate : null,
      sourceIds: ["range_company_guidance"],
      freshness: "current",
      comparisons: [],
      rangeDrivers: ["gas_pricing"],
      materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
      metadata: { source: record.source, status: record.status ?? null, reportingCycle: record.reportingCycle ?? null }
    });
  }

  const manifestEntries: SourceManifestEntry[] = [
    { key: "range_company_financials", label: "RRC quarterly financials (Codex/FactSet/SEC-direct extraction)", period: LATEST_QUARTER, freshness, included: true },
    { key: "range_company_guidance", label: "RRC management guidance", period: guidanceRecords[0]?.reportingCycle ?? null, freshness: guidanceRecords.length > 0 ? "current" : "unavailable", included: guidanceRecords.length > 0 }
  ];

  return { items, manifestEntries, present: items.length > 0 };
}

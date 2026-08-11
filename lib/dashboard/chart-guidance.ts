import managementGuidanceData from "@/data/management-guidance.json";
import type { Metric, Ticker } from "./types";

export type GuidanceAuditStatus = "explicit_guidance" | "long_term_target" | "not_guided";
export type GuidanceType = string;
export type GuidanceStatus = "new" | "raised" | "lowered" | "narrowed" | "reaffirmed" | "updated" | "current" | string;

type GuidanceEntry = {
  company: Ticker;
  metric: string;
  period: string;
  plotPeriod: string;
  low: number | null;
  midpoint: number | null;
  high: number | null;
  unit: string;
  guidanceType: GuidanceType;
  source: string;
  sourceUrl?: string;
  sourceDate: string;
  chartable: boolean;
  reportingCycle?: string;
  priorReportingCycle?: string;
  status?: GuidanceStatus;
  sourceLocation?: string;
  managementWording?: string;
  operator?: string;
  reportedValue?: number;
  note?: string;
};

type CompanyGuidance = {
  audit: Record<Metric, GuidanceAuditStatus>;
  entries: GuidanceEntry[];
};

type ManagementGuidanceFile = {
  meta: { auditAsOf: string; note: string; reportingCycle?: string; ingestionSource?: string };
  companies: Record<Ticker, CompanyGuidance>;
};

const data = managementGuidanceData as ManagementGuidanceFile;

type GuidanceMetadata = Omit<GuidanceEntry, "chartable" | "company" | "metric" | "low" | "midpoint" | "high"> & {
  ticker: Ticker;
  metric: Metric;
  midpoint: number | null;
};

export type ChartGuidancePoint =
  | (GuidanceMetadata & { kind: "point"; value: number; chartValue: number })
  | (GuidanceMetadata & { kind: "range"; low: number; high: number; chartLow: number; chartHigh: number; chartMidpoint: number });

export type ChartGuidanceResult = {
  status: "provided" | "not_provided";
  auditStatus: GuidanceAuditStatus;
  points: ChartGuidancePoint[];
};

function toChartValue(value: number, unit: string): number | null {
  if (unit === "Bcfe/d") return value * 1_000;
  if (unit.toLowerCase() === "mmcfe/d" || unit === "$MM") return value;
  return null;
}

function normalizeEntry(entry: GuidanceEntry): ChartGuidancePoint | null {
  if (!entry.chartable) return null;
  // Thresholds remain visible in the full guidance view, but are never treated as ordinary points.
  if (entry.operator) return null;
  // AR reaffirmed components in Q2 without independently restating a total; do not infer one for the chart.
  if (entry.company === "AR" && entry.metric === "capex" && entry.note?.includes("not independently restated")) return null;

  const normalizedMidpoint = entry.low !== null && entry.high !== null
    ? (entry.midpoint !== null && entry.midpoint >= entry.low && entry.midpoint <= entry.high
      ? entry.midpoint
      : (entry.low + entry.high) / 2)
    : entry.midpoint;
  const metadata: GuidanceMetadata = {
    ticker: entry.company,
    metric: entry.metric as Metric,
    period: entry.period,
    plotPeriod: entry.plotPeriod,
    midpoint: normalizedMidpoint,
    unit: entry.unit,
    guidanceType: entry.guidanceType,
    source: entry.source,
    sourceUrl: entry.sourceUrl,
    sourceDate: entry.sourceDate,
    reportingCycle: entry.reportingCycle,
    status: entry.status,
    sourceLocation: entry.sourceLocation,
    managementWording: entry.managementWording,
    operator: entry.operator,
    note: entry.note
  };

  if (entry.low !== null && entry.high !== null) {
    const chartLow = toChartValue(entry.low, entry.unit);
    const chartHigh = toChartValue(entry.high, entry.unit);
    const chartMidpoint = toChartValue(normalizedMidpoint ?? (entry.low + entry.high) / 2, entry.unit);
    if (chartLow === null || chartHigh === null || chartMidpoint === null) return null;
    return { ...metadata, kind: "range", low: entry.low, high: entry.high, chartLow, chartHigh, chartMidpoint };
  }

  if (entry.midpoint === null) return null;
  const chartValue = toChartValue(entry.midpoint, entry.unit);
  return chartValue === null ? null : { ...metadata, kind: "point", value: entry.midpoint, chartValue };
}

/** Source-verified, chart-compatible management guidance for one company and metric. */
export function getChartGuidance(ticker: Ticker, metric: Metric): ChartGuidanceResult {
  const company = data.companies[ticker];
  const auditStatus = company?.audit[metric] ?? "not_guided";
  const points = (company?.entries ?? [])
    .filter((entry) => entry.metric === metric && entry.reportingCycle === data.meta.reportingCycle)
    .map(normalizeEntry)
    .filter((entry): entry is ChartGuidancePoint => entry !== null);

  return { status: points.length > 0 ? "provided" : "not_provided", auditStatus, points };
}

/** Full company-by-metric matrix used to verify that every supported peer was audited. */
export function getManagementGuidanceAuditMatrix(): Record<Ticker, Record<Metric, GuidanceAuditStatus>> {
  return Object.fromEntries(
    Object.entries(data.companies).map(([ticker, company]) => [ticker, company.audit])
  ) as Record<Ticker, Record<Metric, GuidanceAuditStatus>>;
}

export function getManagementGuidanceAuditMeta(): ManagementGuidanceFile["meta"] {
  return data.meta;
}

/** The chart toggle affects the guidance overlay only. */
export function getVisibleChartGuidance(result: ChartGuidanceResult, visible: boolean): ChartGuidancePoint[] {
  return visible ? result.points : [];
}

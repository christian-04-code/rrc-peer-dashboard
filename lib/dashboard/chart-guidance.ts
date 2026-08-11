import managementGuidanceData from "@/data/management-guidance.json";
import type { Metric, Ticker } from "./types";

export type GuidanceAuditStatus = "explicit_guidance" | "long_term_target" | "not_guided";
export type GuidanceType = "range" | "approximate" | "long_term_target" | "conditional_target" | "minimum_growth";

type GuidanceEntry = {
  company: Ticker;
  metric: Metric;
  period: string;
  plotPeriod: string;
  low: number | null;
  midpoint: number | null;
  high: number | null;
  unit: string;
  guidanceType: GuidanceType;
  source: string;
  sourceUrl: string;
  sourceDate: string;
  chartable: boolean;
  note?: string;
};

type CompanyGuidance = {
  audit: Record<Metric, GuidanceAuditStatus>;
  entries: GuidanceEntry[];
};

type ManagementGuidanceFile = {
  meta: { auditAsOf: string; note: string };
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
  if (unit === "MMcfe/d" || unit === "$MM") return value;
  return null;
}

function normalizeEntry(entry: GuidanceEntry): ChartGuidancePoint | null {
  if (!entry.chartable) return null;
  const metadata: GuidanceMetadata = {
    ticker: entry.company,
    metric: entry.metric,
    period: entry.period,
    plotPeriod: entry.plotPeriod,
    midpoint: entry.midpoint,
    unit: entry.unit,
    guidanceType: entry.guidanceType,
    source: entry.source,
    sourceUrl: entry.sourceUrl,
    sourceDate: entry.sourceDate,
    note: entry.note
  };

  if (entry.low !== null && entry.high !== null) {
    const chartLow = toChartValue(entry.low, entry.unit);
    const chartHigh = toChartValue(entry.high, entry.unit);
    const midpoint = entry.midpoint ?? (entry.low + entry.high) / 2;
    const chartMidpoint = toChartValue(midpoint, entry.unit);
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
    .filter((entry) => entry.metric === metric)
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

export function getManagementGuidanceAuditMeta(): { auditAsOf: string; note: string } {
  return data.meta;
}

/** The chart toggle affects the guidance overlay only. */
export function getVisibleChartGuidance(result: ChartGuidanceResult, visible: boolean): ChartGuidancePoint[] {
  return visible ? result.points : [];
}

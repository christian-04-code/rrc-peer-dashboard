import managementGuidanceData from "@/data/management-guidance.json";
import type { Metric, Ticker } from "./types";

export type GuidanceAuditStatus = "explicit_guidance" | "long_term_target" | "not_guided";
export type GuidanceType = string;
export type GuidanceStatus = "new" | "raised" | "lowered" | "narrowed" | "reaffirmed" | "updated" | "current" | string;

type GuidanceEntry = {
  company: Ticker;
  metric: string;
  chartMetric?: Metric;
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

export type SelectedChartGuidanceResult = {
  status: "provided" | "not_provided";
  points: ChartGuidancePoint[];
};

function daysInGuidancePeriod(period: string): number | null {
  const fiscalYear = /^FY (\d{4})$/.exec(period);
  if (fiscalYear) {
    const year = Number(fiscalYear[1]);
    return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
  }

  const fiscalQuarter = /^Q([1-4]) (\d{4})$/.exec(period);
  if (fiscalQuarter) {
    const quarter = Number(fiscalQuarter[1]);
    const year = Number(fiscalQuarter[2]);
    const startMonth = (quarter - 1) * 3;
    return (Date.UTC(year, startMonth + 3, 1) - Date.UTC(year, startMonth, 1)) / 86_400_000;
  }

  return null;
}

function toChartValue(value: number, entry: GuidanceEntry, metric: Metric): number | null {
  if (entry.unit === "Bcfe/d") return value * 1_000;
  if (entry.unit.toLowerCase() === "mmcfe/d" || entry.unit === "$MM") return value;
  if (metric === "production" && entry.unit === "Bcfe") {
    const days = daysInGuidancePeriod(entry.period);
    return days === null ? null : value * 1_000 / days;
  }
  return null;
}

function chartMetricForEntry(entry: GuidanceEntry): Metric | null {
  const metric = entry.chartMetric ?? entry.metric;
  return ["production", "revenue", "fcf", "capex", "debt", "ebitdax"].includes(metric)
    ? metric as Metric
    : null;
}

function normalizeEntry(entry: GuidanceEntry, metric: Metric): ChartGuidancePoint | null {
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
    metric,
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
    const chartLow = toChartValue(entry.low, entry, metric);
    const chartHigh = toChartValue(entry.high, entry, metric);
    const chartMidpoint = toChartValue(normalizedMidpoint ?? (entry.low + entry.high) / 2, entry, metric);
    if (chartLow === null || chartHigh === null || chartMidpoint === null) return null;
    return { ...metadata, kind: "range", low: entry.low, high: entry.high, chartLow, chartHigh, chartMidpoint };
  }

  if (entry.midpoint === null) return null;
  const chartValue = toChartValue(entry.midpoint, entry, metric);
  return chartValue === null ? null : { ...metadata, kind: "point", value: entry.midpoint, chartValue };
}

/** Source-verified, chart-compatible management guidance for one company and metric. */
export function getChartGuidance(ticker: Ticker, metric: Metric): ChartGuidanceResult {
  const company = data.companies[ticker];
  const auditStatus = company?.audit[metric] ?? "not_guided";
  const points = (company?.entries ?? [])
    .filter((entry) => chartMetricForEntry(entry) === metric && entry.reportingCycle === data.meta.reportingCycle)
    .map((entry) => normalizeEntry(entry, metric))
    .filter((entry): entry is ChartGuidancePoint => entry !== null);

  return { status: points.length > 0 ? "provided" : "not_provided", auditStatus, points };
}

/** Chart-compatible guidance for every company in the active comparison set. */
export function getSelectedChartGuidance(tickers: Ticker[], metric: Metric): SelectedChartGuidanceResult {
  const points = tickers.flatMap((ticker) => getChartGuidance(ticker, metric).points);
  return { status: points.length > 0 ? "provided" : "not_provided", points };
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
export function getVisibleChartGuidance(
  result: Pick<ChartGuidanceResult, "points"> | SelectedChartGuidanceResult,
  visible: boolean
): ChartGuidancePoint[] {
  return visible ? result.points : [];
}

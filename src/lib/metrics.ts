import type { CompanyHistorical, HistoricalMetric, Quarter } from "./types";
import { CORE_PEER_ORDER } from "./constants";

/**
 * Every accessor here returns `null` (never 0, never an estimate) when the
 * underlying data is null/missing. Callers must render nulls explicitly
 * (e.g. "—" / "N/D") rather than coercing to a number.
 */

export function getMetric(
  company: CompanyHistorical,
  metricName: string,
  group: "metrics" | "normalized_metrics" = "metrics",
): HistoricalMetric | undefined {
  return company[group][metricName];
}

export function getValue(
  company: CompanyHistorical,
  metricName: string,
  quarter: Quarter,
  group: "metrics" | "normalized_metrics" = "metrics",
): number | null {
  const metric = getMetric(company, metricName, group);
  const v = metric?.values[quarter];
  return v === undefined ? null : v;
}

export interface PeerValue {
  ticker: string;
  name: string;
  value: number | null;
  isRRC: boolean;
}

export function getCorePeerValues(
  companies: Record<string, CompanyHistorical>,
  metricName: string,
  quarter: Quarter,
  group: "metrics" | "normalized_metrics" = "metrics",
): PeerValue[] {
  return CORE_PEER_ORDER.map((ticker) => {
    const company = companies[ticker];
    return {
      ticker,
      name: company?.name ?? ticker,
      value: company ? getValue(company, metricName, quarter, group) : null,
      isRRC: ticker === "RRC",
    };
  });
}

/** Median of non-null values only. Returns null if no values are present. */
export function median(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null && !Number.isNaN(v));
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  }
  return sorted[mid] as number;
}

export function rankDescending(peers: PeerValue[]): (PeerValue & { rank: number | null })[] {
  const withValues = peers.filter((p) => p.value !== null) as (PeerValue & { value: number })[];
  const sorted = [...withValues].sort((a, b) => b.value - a.value);
  const rankByTicker = new Map(sorted.map((p, i) => [p.ticker, i + 1]));
  return peers.map((p) => ({ ...p, rank: rankByTicker.get(p.ticker) ?? null }));
}

export function formatValue(value: number | null, unit: string, opts?: { signed?: boolean }): string {
  if (value === null || Number.isNaN(value)) return "—";
  const signed = opts?.signed ?? false;
  const sign = signed && value > 0 ? "+" : "";

  if (unit === "%") {
    return `${sign}${(value * 100).toFixed(1)}`;
  }
  if (unit === "x") {
    return `${value.toFixed(2)}`;
  }
  if (unit === "$mm" || unit === "$MM") {
    return `${sign}${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  }
  if (unit === "$/Mcfe" || unit === "$/Mcf" || unit === "$/bbl") {
    return `${sign}${value.toFixed(2)}`;
  }
  // default: 1 decimal
  return `${sign}${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function unitLabel(unit: string): string {
  if (unit === "$mm" || unit === "$MM") return "$MM";
  return unit;
}

export function pctDeltaVsMedian(value: number | null, med: number | null): number | null {
  if (value === null || med === null || med === 0) return null;
  return (value - med) / Math.abs(med);
}

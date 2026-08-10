import type { RrcCurrentMarketPrices } from "@/lib/forecast/scenarios/rrc-complete";
import type { SourcedValue } from "@/lib/forecast/types";
import type { NormalizedMarketMetric } from "@/lib/market/types";

export type LiveMarketMetric = {
  value: number | null;
  period?: string | null;
  fetchedAt?: string | null;
  source?: string | null;
} | null | undefined;

export type LiveMarketPricesInput = {
  henryHub?: LiveMarketMetric;
  wti?: LiveMarketMetric;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toLiveSourcedValue(metric: LiveMarketMetric, unit: string, label: string): SourcedValue | undefined {
  if (!metric || !isFiniteNumber(metric.value)) return undefined;
  return {
    value: metric.value,
    unit,
    source: {
      name: metric.source ?? "U.S. EIA",
      reference: label,
      period: metric.period ?? "current",
      retrievedAt: metric.fetchedAt ?? new Date().toISOString(),
      classification: "live",
      notes: `Current-market ${label} price from the EIA feed, held flat as a scenario input across every forecast period (2026Q1-2028Q4). This is a flat current-market scenario, not a futures or forward curve; it replaces the modeled Range management sensitivity assumption for this run only when a valid live value is available.`
    }
  };
}

/**
 * Converts raw live market metrics (as returned by /api/market) into the
 * scenario engine's currentMarketPrices override. A commodity is omitted
 * (undefined) whenever its live value is missing or non-numeric, so the
 * existing `?? modeled default` fallback in rrc-complete.ts applies —
 * never a fabricated or zeroed price. The override is a flat current-market
 * scenario (today's value held constant across every forecast period), not
 * a forward-curve projection.
 */
export function buildCurrentMarketPrices(input: LiveMarketPricesInput): RrcCurrentMarketPrices {
  return {
    henryHubPerMmbtu: toLiveSourcedValue(input.henryHub, "$/MMBtu", "Henry Hub"),
    wtiPerBbl: toLiveSourcedValue(input.wti, "$/bbl", "WTI")
  };
}

function toLiveMarketMetric(metric: NormalizedMarketMetric | undefined): LiveMarketMetric {
  if (!metric || metric.status !== "ok" || typeof metric.value !== "number" || !Number.isFinite(metric.value)) return null;
  return { value: metric.value, period: metric.period, fetchedAt: metric.fetchedAt, source: metric.source };
}

/** Pulls henry_hub/wti out of the /api/market metrics list into the raw shape the /api/rrc-scenarios POST body expects. */
export function extractLiveMarketMetrics(metrics: NormalizedMarketMetric[] | undefined): LiveMarketPricesInput {
  return {
    henryHub: toLiveMarketMetric(metrics?.find((metric) => metric.id === "henry_hub")),
    wti: toLiveMarketMetric(metrics?.find((metric) => metric.id === "wti"))
  };
}

/** Same extraction, already converted to the SourcedValue form the forecast engine's scenario functions accept directly (for callers that run the engine client-side instead of going through the API route). */
export function buildCurrentMarketPricesFromMetrics(metrics: NormalizedMarketMetric[] | undefined): RrcCurrentMarketPrices {
  return buildCurrentMarketPrices(extractLiveMarketMetrics(metrics));
}

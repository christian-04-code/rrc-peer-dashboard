import type { RrcCurrentMarketPrices } from "@/lib/forecast/scenarios/rrc-complete";
import type { SourcedValue } from "@/lib/forecast/types";
import type { NormalizedMarketMetric } from "@/lib/market/types";
import type { FmpCommodityQuote, FmpQuotesResponse } from "@/lib/market/fmp-types";

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

/**
 * EIA is the only commodity source actually wired into the live UI (Finnhub has no
 * commodities/futures coverage on the current account; FMP calls were removed from
 * this flow after its subscription returned HTTP 402). EIA's own quote is the latest
 * official observation, delayed -- not real-time -- so the notes text must say that
 * plainly rather than claiming "current-market" for it. If a future source string
 * doesn't mention EIA (e.g. a re-entitled live provider), the wording still says
 * "current-market", which remains accurate for that case.
 */
function toLiveSourcedValue(metric: LiveMarketMetric, unit: string, label: string): SourcedValue | undefined {
  if (!metric || !isFiniteNumber(metric.value)) return undefined;
  const sourceLabel = metric.source ?? "the configured market-data feed";
  const isDelayedOfficial = /EIA/i.test(sourceLabel);
  const qualifier = isDelayedOfficial ? "Latest official/delayed" : "Current-market";
  return {
    value: metric.value,
    unit,
    source: {
      name: sourceLabel,
      reference: label,
      period: metric.period ?? "current",
      retrievedAt: metric.fetchedAt ?? new Date().toISOString(),
      classification: "live",
      notes: `${qualifier} ${label} price from ${sourceLabel}, held flat as a scenario input across every forecast period (2026Q1-2028Q4). This is a flat scenario input, not a futures or forward curve; it replaces the modeled Range management sensitivity assumption for this run only when a valid value is available.${isDelayedOfficial ? " This is EIA's latest official observation, not a real-time quote." : ""}`
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

function pickFirstValid(...candidates: LiveMarketMetric[]): LiveMarketMetric {
  for (const candidate of candidates) {
    if (candidate && isFiniteNumber(candidate.value)) return candidate;
  }
  return null;
}

function toLiveMarketMetricFromFmp(quote: FmpCommodityQuote | undefined): LiveMarketMetric {
  if (!quote || quote.status !== "ok" || !isFiniteNumber(quote.value)) return null;
  return { value: quote.value, period: "current", fetchedAt: quote.fetchedAt, source: `FMP (${quote.symbol})` };
}

/**
 * FMP owns the current-market commodity quote; the EIA latest-official/delayed
 * observation is used only when FMP's quote is missing or invalid for that
 * commodity, independently per commodity (Henry Hub and WTI never share a
 * fallback decision). If neither source has a valid value, the field is omitted
 * so the existing `?? modeled management-sensitivity default` in rrc-complete.ts
 * applies -- this function never fabricates or zeros a price, and never mixes
 * FMP and EIA values within the same commodity.
 */
export function extractLiveMarketMetricsWithFallback(
  fmp: FmpQuotesResponse | null | undefined,
  eiaMetrics: NormalizedMarketMetric[] | undefined
): LiveMarketPricesInput {
  const eia = extractLiveMarketMetrics(eiaMetrics);
  return {
    henryHub: pickFirstValid(toLiveMarketMetricFromFmp(fmp?.commodities.henryHub), eia.henryHub),
    wti: pickFirstValid(toLiveMarketMetricFromFmp(fmp?.commodities.wti), eia.wti)
  };
}

/** Same FMP-first/EIA-fallback resolution, already converted to the SourcedValue form the forecast engine accepts directly (for client-side engine calls, mirroring buildCurrentMarketPricesFromMetrics). */
export function buildCurrentMarketPricesFromFmpAndEia(
  fmp: FmpQuotesResponse | null | undefined,
  eiaMetrics: NormalizedMarketMetric[] | undefined
): RrcCurrentMarketPrices {
  return buildCurrentMarketPrices(extractLiveMarketMetricsWithFallback(fmp, eiaMetrics));
}

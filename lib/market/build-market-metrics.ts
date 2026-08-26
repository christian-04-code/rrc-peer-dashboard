import {
  fetchBrentDailySpot,
  fetchHenryHubDailySpot,
  fetchLower48StorageWeekly,
  fetchUsDryGasProductionMonthly,
  fetchUsLngExportsMonthly,
  fetchUsPropaneStocksWeekly,
  fetchWtiDailySpot,
  type EiaFetchResult
} from "@/lib/eia/client";
import type { MarketFrequency, MarketMetricClassification, NormalizedMarketMetric } from "@/lib/market/types";
import { calculateFreshness } from "@/lib/market/macro-analytics";

/**
 * Extracted from app/api/market/route.ts (unchanged behavior) so the same
 * seven live EIA/OilPriceAPI-independent commodity histories can be reused
 * by the Phase 6D Macro risk engine without a second, divergent set of
 * fetch calls or a fragile self-HTTP-call to /api/market from another
 * server route. /api/market/route.ts now imports buildNormalizedMarketMetrics
 * from here instead of defining this inline.
 */
type MetricDefinition = {
  id: string;
  label: string;
  unit: string;
  frequency: MarketFrequency;
  classification: MarketMetricClassification;
  fetcher: () => Promise<EiaFetchResult>;
};

const METRIC_DEFINITIONS: MetricDefinition[] = [
  { id: "henry_hub", label: "Henry Hub", unit: "$/MMBtu", frequency: "daily", classification: "delayed", fetcher: () => fetchHenryHubDailySpot(60) },
  { id: "wti", label: "WTI", unit: "$/bbl", frequency: "daily", classification: "delayed", fetcher: () => fetchWtiDailySpot(60) },
  { id: "brent", label: "Brent", unit: "$/bbl", frequency: "daily", classification: "delayed", fetcher: () => fetchBrentDailySpot(60) },
  { id: "storage", label: "Lower 48 Storage", unit: "Bcf", frequency: "weekly", classification: "delayed", fetcher: () => fetchLower48StorageWeekly(320) },
  { id: "lng_exports", label: "U.S. LNG Exports", unit: "MMcf/month", frequency: "monthly", classification: "delayed", fetcher: () => fetchUsLngExportsMonthly(36) },
  { id: "dry_gas_production", label: "U.S. Dry Gas Production", unit: "MMcf/month", frequency: "monthly", classification: "delayed", fetcher: () => fetchUsDryGasProductionMonthly(36) },
  { id: "propane_stocks", label: "U.S. Propane Inventories", unit: "Mbbl", frequency: "weekly", classification: "delayed", fetcher: () => fetchUsPropaneStocksWeekly(160) }
];

function normalizeSuccess(definition: MetricDefinition, result: EiaFetchResult): NormalizedMarketMetric {
  const latest = result.points[0];
  return {
    id: definition.id,
    label: definition.label,
    value: latest?.value ?? null,
    unit: definition.unit,
    period: latest?.period ?? null,
    seriesId: result.seriesId,
    frequency: result.frequency,
    history: result.points,
    fetchedAt: result.fetchedAt,
    source: `U.S. EIA (${result.seriesId})`,
    classification: definition.classification,
    freshness: calculateFreshness(latest?.period ?? null, result.frequency),
    status: latest ? "ok" : "unavailable"
  };
}

function normalizeFailure(definition: MetricDefinition, error: unknown, generatedAt: string): NormalizedMarketMetric {
  return {
    id: definition.id,
    label: definition.label,
    value: null,
    unit: definition.unit,
    period: null,
    seriesId: null,
    frequency: definition.frequency,
    history: [],
    fetchedAt: generatedAt,
    source: "U.S. EIA",
    classification: definition.classification,
    freshness: "unavailable",
    status: "unavailable",
    error: error instanceof Error ? error.message : "Market feed unavailable"
  };
}

/** One failed fetcher never blocks the other six -- each metric resolves independently via Promise.allSettled. */
export async function buildNormalizedMarketMetrics(generatedAt: string): Promise<NormalizedMarketMetric[]> {
  const settled = await Promise.allSettled(METRIC_DEFINITIONS.map((definition) => definition.fetcher()));
  return settled.map((result, index) => {
    const definition = METRIC_DEFINITIONS[index];
    return result.status === "fulfilled"
      ? normalizeSuccess(definition, result.value)
      : normalizeFailure(definition, result.reason, generatedAt);
  });
}

import { NextResponse } from "next/server";
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
import type {
  MarketApiResponse,
  NormalizedMarketMetric
} from "@/lib/market/types";
import { calculateFreshness } from "@/lib/market/macro-analytics";

// force-dynamic (matching app/api/forecast and app/api/rrc-scenarios) so this route
// re-reads EIA_API_KEY and calls the live EIA API on every invocation, instead of being
// eligible for Next.js's default GET Route Handler build-time caching -- a route with no
// dynamic functions and only `next.revalidate` fetch options is otherwise generated once
// at build time and only revalidated per the interval below. If EIA_API_KEY was added to
// Vercel after the last build, that would bake in a permanent "unavailable" response until
// a redeploy. The explicit Cache-Control header still gives CDN-level 900s caching.
export const dynamic = "force-dynamic";
export const revalidate = 900;

const definitions = [
  {
    id: "henry_hub",
    label: "Henry Hub",
    unit: "$/MMBtu",
    frequency: "daily" as const,
    classification: "delayed" as const,
    fetcher: () => fetchHenryHubDailySpot(60)
  },
  {
    id: "wti",
    label: "WTI",
    unit: "$/bbl",
    frequency: "daily" as const,
    classification: "delayed" as const,
    fetcher: () => fetchWtiDailySpot(60)
  },
  {
    id: "brent",
    label: "Brent",
    unit: "$/bbl",
    frequency: "daily" as const,
    classification: "delayed" as const,
    fetcher: () => fetchBrentDailySpot(60)
  },
  {
    id: "storage",
    label: "Lower 48 Storage",
    unit: "Bcf",
    frequency: "weekly" as const,
    classification: "delayed" as const,
    fetcher: () => fetchLower48StorageWeekly(320)
  },
  {
    id: "lng_exports",
    label: "U.S. LNG Exports",
    unit: "MMcf/month",
    frequency: "monthly" as const,
    classification: "delayed" as const,
    fetcher: () => fetchUsLngExportsMonthly(36)
  },
  {
    id: "dry_gas_production",
    label: "U.S. Dry Gas Production",
    unit: "MMcf/month",
    frequency: "monthly" as const,
    classification: "delayed" as const,
    fetcher: () => fetchUsDryGasProductionMonthly(36)
  },
  {
    id: "propane_stocks",
    label: "U.S. Propane Inventories",
    unit: "Mbbl",
    frequency: "weekly" as const,
    classification: "delayed" as const,
    fetcher: () => fetchUsPropaneStocksWeekly(160)
  }
];

function normalizeSuccess(
  definition: (typeof definitions)[number],
  result: EiaFetchResult
): NormalizedMarketMetric {
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

function normalizeFailure(
  definition: (typeof definitions)[number],
  error: unknown,
  generatedAt: string
): NormalizedMarketMetric {
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

export async function GET() {
  const generatedAt = new Date().toISOString();
  const settled = await Promise.allSettled(
    definitions.map((definition) => definition.fetcher())
  );

  const metrics = settled.map((result, index) => {
    const definition = definitions[index];
    return result.status === "fulfilled"
      ? normalizeSuccess(definition, result.value)
      : normalizeFailure(definition, result.reason, generatedAt);
  });

  const response: MarketApiResponse = { generatedAt, metrics };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600"
    }
  });
}

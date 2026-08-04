import { NextResponse } from "next/server";
import {
  fetchBrentDailySpot,
  fetchHenryHubDailySpot,
  fetchLower48StorageWeekly,
  fetchUsLngExportsMonthly,
  fetchWtiDailySpot,
  type EiaFetchResult
} from "@/lib/eia/client";
import type {
  MarketApiResponse,
  NormalizedMarketMetric
} from "@/lib/market/types";

export const revalidate = 900;

const definitions = [
  {
    id: "henry_hub",
    label: "Henry Hub",
    unit: "$/MMBtu",
    classification: "delayed" as const,
    fetcher: () => fetchHenryHubDailySpot(5)
  },
  {
    id: "wti",
    label: "WTI",
    unit: "$/bbl",
    classification: "delayed" as const,
    fetcher: () => fetchWtiDailySpot(5)
  },
  {
    id: "brent",
    label: "Brent",
    unit: "$/bbl",
    classification: "delayed" as const,
    fetcher: () => fetchBrentDailySpot(5)
  },
  {
    id: "storage",
    label: "Lower 48 Storage",
    unit: "Bcf",
    classification: "delayed" as const,
    fetcher: () => fetchLower48StorageWeekly(4)
  },
  {
    id: "lng_exports",
    label: "U.S. LNG Exports",
    unit: "MMcf/month",
    classification: "delayed" as const,
    fetcher: () => fetchUsLngExportsMonthly(4)
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
    fetchedAt: result.fetchedAt,
    source: `U.S. EIA (${result.seriesId})`,
    classification: definition.classification,
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
    fetchedAt: generatedAt,
    source: "U.S. EIA",
    classification: definition.classification,
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

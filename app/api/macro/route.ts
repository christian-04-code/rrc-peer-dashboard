import { NextResponse } from "next/server";
import {
  fetchDemandTable,
  fetchRegionalStorageTable,
  fetchStateMarketedProductionTable
} from "@/lib/eia/macro-fundamentals";
import {
  normalizeDemand,
  normalizeRegionalStorage,
  normalizeStateProduction,
  unavailableMacroFundamentals
} from "@/lib/market/macro-fundamentals";
import type { MacroFundamentalsResponse } from "@/lib/market/macro-types";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET() {
  const generatedAt = new Date().toISOString();
  const response = unavailableMacroFundamentals(generatedAt);
  const [storage, production, demand] = await Promise.allSettled([
    fetchRegionalStorageTable(),
    fetchStateMarketedProductionTable(),
    fetchDemandTable()
  ]);

  if (storage.status === "fulfilled") {
    response.storage = { status: "ok", regions: normalizeRegionalStorage(storage.value) };
  } else {
    response.storage.error = storage.reason instanceof Error ? storage.reason.message : "Regional storage unavailable";
  }
  if (production.status === "fulfilled") {
    response.production = {
      status: "ok",
      measure: "Marketed natural gas production",
      states: normalizeStateProduction(production.value)
    };
  } else {
    response.production.error = production.reason instanceof Error ? production.reason.message : "State production unavailable";
  }
  if (demand.status === "fulfilled") {
    response.demand = { status: "ok", series: normalizeDemand(demand.value) };
  } else {
    response.demand.error = demand.reason instanceof Error ? demand.reason.message : "Demand unavailable";
  }

  // A degraded response (e.g. a transient upstream EIA rate limit) must not be
  // pinned behind the same long CDN TTL as a healthy one -- caching it for
  // s-maxage=3600 would freeze that transient failure into an hours-long visible
  // outage on the Macro tab. Give degraded responses a short TTL so the next
  // request retries soon instead of being served the same cached error.
  const degraded = response.storage.status !== "ok" || response.production.status !== "ok" || response.demand.status !== "ok";
  const cacheControl = degraded
    ? "public, s-maxage=30, stale-while-revalidate=60"
    : "public, s-maxage=3600, stale-while-revalidate=21600";

  return NextResponse.json(response satisfies MacroFundamentalsResponse, {
    headers: { "Cache-Control": cacheControl }
  });
}

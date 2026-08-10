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
import { fetchOilPriceApiQuotes, type OilPriceApiQuote, type OilPriceApiResult } from "@/lib/oilpriceapi/client";
import { OIL_PRICE_API_CODES } from "@/lib/oilpriceapi/codes";
import type {
  CurrentMarketCommodityQuote,
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

function unavailableCurrentMarket(
  id: "wti" | "henry_hub",
  label: string,
  code: string,
  fetchedAt: string,
  error: string,
  quote?: OilPriceApiQuote
): CurrentMarketCommodityQuote {
  return {
    id, label, code, price: null,
    unit: quote?.unit ?? null,
    currency: quote?.currency ?? null,
    source: "OilPriceAPI",
    classification: "current-market",
    asOf: quote?.asOf ?? null,
    dataStatus: quote?.dataStatus ?? null,
    stale: quote?.stale ?? null,
    synthetic: quote?.synthetic ?? null,
    change24hAmount: null,
    change24hPercent: null,
    fetchedAt,
    status: "unavailable",
    error
  };
}

function currentMarketQuoteFor(
  id: "wti" | "henry_hub",
  label: string,
  code: string,
  fetchedAt: string,
  result: OilPriceApiResult | null,
  batchError?: string
): CurrentMarketCommodityQuote {
  if (!result) return unavailableCurrentMarket(id, label, code, fetchedAt, batchError ?? "OilPriceAPI request failed.");
  const quote = result.quotesByCode.get(code);
  if (!quote) return unavailableCurrentMarket(id, label, code, fetchedAt, "OilPriceAPI did not return this code.");
  if (quote.stale) return unavailableCurrentMarket(id, label, code, fetchedAt, "OilPriceAPI marked this quote stale.", quote);
  if (quote.synthetic) return unavailableCurrentMarket(id, label, code, fetchedAt, "OilPriceAPI marked this quote synthetic.", quote);
  if (quote.price === null) return unavailableCurrentMarket(id, label, code, fetchedAt, "OilPriceAPI returned no numeric price.", quote);
  return {
    id, label, code, price: quote.price, unit: quote.unit, currency: quote.currency,
    source: "OilPriceAPI", classification: "current-market", asOf: quote.asOf,
    dataStatus: quote.dataStatus, stale: quote.stale, synthetic: quote.synthetic,
    change24hAmount: quote.change24hAmount, change24hPercent: quote.change24hPercent,
    fetchedAt, status: "ok"
  };
}

async function fetchCurrentMarket(generatedAt: string): Promise<MarketApiResponse["currentMarket"]> {
  let result: OilPriceApiResult | null = null;
  let error: string | undefined;
  try {
    result = await fetchOilPriceApiQuotes([OIL_PRICE_API_CODES.wti, OIL_PRICE_API_CODES.henryHub]);
  } catch (reason) {
    error = reason instanceof Error ? reason.message : "OilPriceAPI request failed.";
  }
  return {
    wti: currentMarketQuoteFor("wti", "WTI", OIL_PRICE_API_CODES.wti, generatedAt, result, error),
    henryHub: currentMarketQuoteFor("henry_hub", "Henry Hub", OIL_PRICE_API_CODES.henryHub, generatedAt, result, error)
  };
}

export async function GET() {
  const generatedAt = new Date().toISOString();
  const [settled, currentMarket] = await Promise.all([
    Promise.allSettled(definitions.map((definition) => definition.fetcher())),
    fetchCurrentMarket(generatedAt)
  ]);

  const metrics = settled.map((result, index) => {
    const definition = definitions[index];
    return result.status === "fulfilled"
      ? normalizeSuccess(definition, result.value)
      : normalizeFailure(definition, result.reason, generatedAt);
  });

  const response: MarketApiResponse = { generatedAt, metrics, currentMarket };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600"
    }
  });
}

import { NextResponse } from "next/server";
import { fetchOilPriceApiQuotes, type OilPriceApiQuote, type OilPriceApiResult } from "@/lib/oilpriceapi/client";
import { OIL_PRICE_API_CODES } from "@/lib/oilpriceapi/codes";
import type { CurrentMarketCommodityQuote, MarketApiResponse } from "@/lib/market/types";
import { buildNormalizedMarketMetrics } from "@/lib/market/build-market-metrics";

// force-dynamic (matching app/api/forecast and app/api/rrc-scenarios) so this route
// re-reads EIA_API_KEY and calls the live EIA API on every invocation, instead of being
// eligible for Next.js's default GET Route Handler build-time caching -- a route with no
// dynamic functions and only `next.revalidate` fetch options is otherwise generated once
// at build time and only revalidated per the interval below. If EIA_API_KEY was added to
// Vercel after the last build, that would bake in a permanent "unavailable" response until
// a redeploy. The explicit Cache-Control header still gives CDN-level 900s caching.
export const dynamic = "force-dynamic";
export const revalidate = 900;

function unavailableCurrentMarket(
  id: "wti" | "henry_hub",
  label: string,
  code: string,
  fetchedAt: string,
  error: string,
  quote?: OilPriceApiQuote
): CurrentMarketCommodityQuote {
  return {
    id,
    label,
    code,
    price: null,
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
  batchError: string | undefined
): CurrentMarketCommodityQuote {
  if (!result) {
    return unavailableCurrentMarket(id, label, code, fetchedAt, batchError ?? "OilPriceAPI request failed.");
  }

  const quote = result.quotesByCode.get(code);
  if (!quote) {
    return unavailableCurrentMarket(id, label, code, fetchedAt, "OilPriceAPI did not return this code.");
  }
  if (quote.stale === true) {
    return unavailableCurrentMarket(id, label, code, fetchedAt, "OilPriceAPI marked this quote stale; not shown as current market.", quote);
  }
  if (quote.synthetic === true) {
    return unavailableCurrentMarket(id, label, code, fetchedAt, "OilPriceAPI marked this quote synthetic; not shown as current market.", quote);
  }
  if (quote.price === null) {
    return unavailableCurrentMarket(id, label, code, fetchedAt, "OilPriceAPI returned no numeric price for this code.", quote);
  }

  return {
    id,
    label,
    code,
    price: quote.price,
    unit: quote.unit,
    currency: quote.currency,
    source: "OilPriceAPI",
    classification: "current-market",
    asOf: quote.asOf,
    dataStatus: quote.dataStatus,
    stale: quote.stale,
    synthetic: quote.synthetic,
    change24hAmount: quote.change24hAmount,
    change24hPercent: quote.change24hPercent,
    fetchedAt,
    status: "ok"
  };
}

/**
 * OilPriceAPI failure (network, malformed payload, one code missing/stale/synthetic)
 * must never break the rest of /api/market -- this never throws, and each commodity
 * is resolved independently so one bad code doesn't take down the other.
 */
async function fetchCurrentMarketCommodities(generatedAt: string): Promise<MarketApiResponse["currentMarket"]> {
  let result: OilPriceApiResult | null = null;
  let batchError: string | undefined;
  try {
    result = await fetchOilPriceApiQuotes([OIL_PRICE_API_CODES.wti, OIL_PRICE_API_CODES.henryHub]);
  } catch (error) {
    batchError = error instanceof Error ? error.message : "OilPriceAPI request failed.";
  }

  return {
    wti: currentMarketQuoteFor("wti", "WTI", OIL_PRICE_API_CODES.wti, generatedAt, result, batchError),
    henryHub: currentMarketQuoteFor("henry_hub", "Henry Hub", OIL_PRICE_API_CODES.henryHub, generatedAt, result, batchError)
  };
}

export async function GET() {
  const generatedAt = new Date().toISOString();
  const [metrics, currentMarket] = await Promise.all([
    buildNormalizedMarketMetrics(generatedAt),
    fetchCurrentMarketCommodities(generatedAt)
  ]);

  const response: MarketApiResponse = { generatedAt, metrics, currentMarket };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600"
    }
  });
}

import { NextResponse } from "next/server";
import { fetchFmpCommodityQuotes, fetchFmpStockQuotes, type FmpQuote } from "@/lib/fmp/client";
import { FMP_COMMODITY_SYMBOLS, FMP_EQUITY_TICKERS } from "@/lib/fmp/symbols";
import type { FmpCommodityQuote, FmpEquityQuote, FmpQuotesResponse } from "@/lib/market/fmp-types";

// force-dynamic so FMP_KEY is re-read and FMP is called fresh on every invocation
// (see app/api/market/route.ts for the same reasoning re: build-time-cached GET
// Route Handlers). The Cache-Control header below still gives ~60s CDN caching so
// the browser poll (lib/market/use-fmp-quotes.ts) never hammers FMP directly.
export const dynamic = "force-dynamic";

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

function unavailableCommodity(symbol: string, fetchedAt: string, error?: string): FmpCommodityQuote {
  return { value: null, symbol, source: "FMP", classification: "current-market", fetchedAt, status: "unavailable", error };
}

function unavailableEquity(symbol: string, fetchedAt: string, error?: string): FmpEquityQuote {
  return { price: null, symbol, source: "FMP", classification: "current-market", fetchedAt, status: "unavailable", error };
}

export async function GET() {
  const generatedAt = new Date().toISOString();

  // Two independent provider calls (not one per symbol) so the browser only ever
  // makes a single request to this route; independent so a failure in one leg
  // (e.g. the commodity batch) never zeros out the other (equities), and vice versa.
  const [commoditiesResult, equitiesResult] = await Promise.allSettled([
    fetchFmpCommodityQuotes([FMP_COMMODITY_SYMBOLS.henryHub, FMP_COMMODITY_SYMBOLS.wti]),
    fetchFmpStockQuotes(FMP_EQUITY_TICKERS)
  ]);

  const commodityBySymbol =
    commoditiesResult.status === "fulfilled"
      ? new Map(commoditiesResult.value.map((quote): [string, FmpQuote] => [quote.symbol, quote]))
      : new Map<string, FmpQuote>();
  const commodityBatchError =
    commoditiesResult.status === "rejected" ? errorMessage(commoditiesResult.reason, "FMP commodity quote unavailable.") : undefined;

  function commodityQuote(symbol: string): FmpCommodityQuote {
    const row = commodityBySymbol.get(symbol);
    if (!row || row.price === null) {
      return unavailableCommodity(symbol, generatedAt, commodityBatchError ?? "FMP returned no valid quote for this symbol.");
    }
    return { value: row.price, symbol, source: "FMP", classification: "current-market", fetchedAt: generatedAt, status: "ok" };
  }

  const equityBySymbol =
    equitiesResult.status === "fulfilled"
      ? new Map(equitiesResult.value.map((quote): [string, FmpQuote] => [quote.symbol, quote]))
      : new Map<string, FmpQuote>();
  const equityBatchError =
    equitiesResult.status === "rejected" ? errorMessage(equitiesResult.reason, "FMP equity quote unavailable.") : undefined;

  const equities = Object.fromEntries(
    FMP_EQUITY_TICKERS.map((ticker) => {
      const row = equityBySymbol.get(ticker);
      if (!row || row.price === null) {
        return [ticker, unavailableEquity(ticker, generatedAt, equityBatchError ?? "FMP returned no valid quote for this ticker.")];
      }
      return [ticker, { price: row.price, symbol: ticker, source: "FMP", classification: "current-market", fetchedAt: generatedAt, status: "ok" } satisfies FmpEquityQuote];
    })
  ) as FmpQuotesResponse["equities"];

  const response: FmpQuotesResponse = {
    generatedAt,
    commodities: {
      henryHub: commodityQuote(FMP_COMMODITY_SYMBOLS.henryHub),
      wti: commodityQuote(FMP_COMMODITY_SYMBOLS.wti)
    },
    equities
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120"
    }
  });
}

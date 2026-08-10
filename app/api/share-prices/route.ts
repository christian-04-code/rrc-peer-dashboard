import { NextResponse } from "next/server";
import { fetchFinnhubQuotes } from "@/lib/finnhub/client";
import { FINNHUB_EQUITY_TICKERS } from "@/lib/finnhub/symbols";
import type { FinnhubEquityQuote, FinnhubQuotesResponse } from "@/lib/market/finnhub-types";

// force-dynamic so FINNHUB_API_KEY is re-read and Finnhub is called fresh on every
// invocation (see app/api/market/route.ts for the same build-time-caching reasoning).
// The Cache-Control header below still gives ~60s CDN caching so the browser poll
// (lib/market/use-finnhub-quotes.ts) never hammers Finnhub directly.
export const dynamic = "force-dynamic";

export async function GET() {
  const generatedAt = new Date().toISOString();

  // One request per ticker (Finnhub's /quote has no batch param), issued in
  // parallel and fault-isolated per ticker -- one symbol failing never zeros
  // out the others, and the browser still only makes a single request to us.
  const settled = await fetchFinnhubQuotes(FINNHUB_EQUITY_TICKERS);

  const equities = Object.fromEntries(
    FINNHUB_EQUITY_TICKERS.map((ticker, index): [string, FinnhubEquityQuote] => {
      const result = settled[index];
      if (result.status === "rejected" || result.value.price === null) {
        const error =
          result.status === "rejected"
            ? result.reason instanceof Error
              ? result.reason.message
              : "Finnhub quote unavailable."
            : "Finnhub returned no valid quote for this ticker.";
        return [ticker, { price: null, symbol: ticker, source: "Finnhub", classification: "current-market", fetchedAt: generatedAt, timestamp: null, status: "unavailable", error }];
      }
      return [
        ticker,
        {
          price: result.value.price,
          symbol: ticker,
          source: "Finnhub",
          classification: "current-market",
          fetchedAt: generatedAt,
          timestamp: result.value.timestamp,
          status: "ok"
        }
      ];
    })
  ) as FinnhubQuotesResponse["equities"];

  const response: FinnhubQuotesResponse = { generatedAt, equities };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120"
    }
  });
}

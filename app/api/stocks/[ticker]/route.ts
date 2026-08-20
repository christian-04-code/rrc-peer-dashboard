import { NextResponse } from "next/server";
import { getStockCompany } from "@/lib/dashboard/company-directory";
import { fetchFinnhubQuotes } from "@/lib/finnhub/client";
import { calculateStockMetrics, findPreviousHistoricalClose } from "@/lib/market/stock-history";
import type { StockDetailResponse } from "@/lib/market/stock-detail-types";
import { getWorkbookStockHistory } from "@/lib/market/workbook-stock-history";

export const dynamic = "force-dynamic";

const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=120";

export async function GET(_request: Request, { params }: { params: { ticker: string } }) {
  const company = getStockCompany(params.ticker);
  if (!company) {
    return NextResponse.json({ error: "Unsupported stock ticker." }, { status: 404, headers: { "Cache-Control": CACHE_CONTROL } });
  }

  const dataset = getWorkbookStockHistory(company.ticker);
  const [quoteResult] = await fetchFinnhubQuotes([company.ticker]);
  const quote = quoteResult.status === "fulfilled" ? quoteResult.value : null;
  const currentPrice = quote?.price ?? null;
  const quoteTimestamp = quote?.timestamp ?? null;
  const previousClose = findPreviousHistoricalClose(dataset.observations, quoteTimestamp);
  const dailyChange = currentPrice !== null && previousClose !== null ? currentPrice - previousClose : null;
  const response: StockDetailResponse = {
    ticker: company.ticker,
    companyName: company.name,
    currentPrice,
    quoteTimestamp,
    dailyChange,
    dailyChangePercent: dailyChange !== null && previousClose ? (dailyChange / previousClose) * 100 : null,
    marketCap: dataset.supplemental.marketCap,
    marketCapSource: dataset.supplemental.marketCapSource,
    ...calculateStockMetrics(dataset.observations, currentPrice),
    history: {
      observations: dataset.observations,
      source: "Workbook",
      priceBasis: "close",
      earliestDate: dataset.earliestDate,
      latestDate: dataset.latestDate
    },
    generatedAt: new Date().toISOString()
  };
  return NextResponse.json(response, { headers: { "Cache-Control": CACHE_CONTROL } });
}

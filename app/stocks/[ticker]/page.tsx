import type { Metadata } from "next";
import { getStockCompany } from "@/lib/dashboard/company-directory";
import { StockDetailView } from "@/components/stocks/StockDetailView";

export function generateMetadata({ params }: { params: { ticker: string } }): Metadata {
  const company = getStockCompany(params.ticker);
  return { title: company ? `${company.ticker} Stock Detail | RRC Peer Intelligence` : "Unsupported Stock | RRC Peer Intelligence" };
}

export default function StockPage({ params }: { params: { ticker: string } }) {
  const company = getStockCompany(params.ticker);
  return <StockDetailView ticker={company?.ticker ?? null} requestedTicker={params.ticker.toUpperCase()} />;
}


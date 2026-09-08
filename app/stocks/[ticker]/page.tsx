import type { Metadata } from "next";
import { getStockCompany } from "@/lib/dashboard/company-directory";
import { StockDetailView } from "@/components/stocks/StockDetailView";

export function generateMetadata({ params }: { params: { ticker: string } }): Metadata {
  const company = getStockCompany(params.ticker);
  return { title: company ? `${company.ticker} Stock Detail | Range Resources Market & Peer Dashboard` : "Unsupported Stock | Range Resources Market & Peer Dashboard" };
}

export default function StockPage({ params }: { params: { ticker: string } }) {
  const company = getStockCompany(params.ticker);
  return <StockDetailView ticker={company?.ticker ?? null} requestedTicker={params.ticker.toUpperCase()} />;
}


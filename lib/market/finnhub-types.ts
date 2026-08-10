import type { Ticker } from "@/lib/dashboard/types";

export type FinnhubQuoteStatus = "ok" | "unavailable";

export type FinnhubEquityQuote = {
  price: number | null;
  symbol: string;
  source: "Finnhub";
  classification: "current-market";
  fetchedAt: string;
  timestamp: number | null;
  status: FinnhubQuoteStatus;
  error?: string;
};

export type FinnhubQuotesResponse = {
  generatedAt: string;
  equities: Record<Ticker, FinnhubEquityQuote>;
};

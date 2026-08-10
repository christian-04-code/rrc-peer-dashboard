import type { Ticker } from "@/lib/dashboard/types";

export type FmpQuoteStatus = "ok" | "unavailable";

export type FmpCommodityQuote = {
  value: number | null;
  symbol: string;
  source: "FMP";
  classification: "current-market";
  fetchedAt: string;
  status: FmpQuoteStatus;
  error?: string;
};

export type FmpEquityQuote = {
  price: number | null;
  symbol: string;
  source: "FMP";
  classification: "current-market";
  fetchedAt: string;
  status: FmpQuoteStatus;
  error?: string;
};

export type FmpQuotesResponse = {
  generatedAt: string;
  commodities: {
    henryHub: FmpCommodityQuote;
    wti: FmpCommodityQuote;
  };
  equities: Record<Ticker, FmpEquityQuote>;
};

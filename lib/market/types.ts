export type MarketMetricStatus = "ok" | "unavailable";
export type MarketMetricClassification = "live" | "delayed";
export type MarketFrequency = "daily" | "weekly" | "monthly" | "annual";
export type MarketFreshness = "current" | "stale" | "unavailable";

export type MarketObservation = {
  period: string;
  value: number;
};

export type NormalizedMarketMetric = {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  period: string | null;
  seriesId: string | null;
  frequency: MarketFrequency;
  history: MarketObservation[];
  fetchedAt: string;
  source: string;
  classification: MarketMetricClassification;
  freshness: MarketFreshness;
  status: MarketMetricStatus;
  error?: string;
};

/**
 * OilPriceAPI current-market commodity quote. Kept as its own shape (not folded
 * into NormalizedMarketMetric) so an OilPriceAPI "current market" reading is never
 * ambiguous with an EIA "latest official/delayed" one -- source identity, staleness,
 * and freshness metadata all stay explicit.
 */
export type CurrentMarketQuoteStatus = "ok" | "unavailable";

export type CurrentMarketCommodityQuote = {
  id: "wti" | "henry_hub";
  label: string;
  code: string;
  price: number | null;
  unit: string | null;
  currency: string | null;
  source: "OilPriceAPI";
  classification: "current-market";
  asOf: string | null;
  dataStatus: string | null;
  stale: boolean | null;
  synthetic: boolean | null;
  change24hAmount: number | null;
  change24hPercent: number | null;
  fetchedAt: string;
  status: CurrentMarketQuoteStatus;
  error?: string;
};

export type MarketApiResponse = {
  generatedAt: string;
  metrics: NormalizedMarketMetric[];
  currentMarket: {
    wti: CurrentMarketCommodityQuote;
    henryHub: CurrentMarketCommodityQuote;
  };
};

export type MarketMetricStatus = "ok" | "unavailable";
export type MarketMetricClassification = "live" | "delayed";

export type NormalizedMarketMetric = {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  period: string | null;
  fetchedAt: string;
  source: string;
  classification: MarketMetricClassification;
  status: MarketMetricStatus;
  error?: string;
};

export type MarketApiResponse = {
  generatedAt: string;
  metrics: NormalizedMarketMetric[];
};

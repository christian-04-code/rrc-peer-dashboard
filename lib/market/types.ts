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

export type MarketApiResponse = {
  generatedAt: string;
  metrics: NormalizedMarketMetric[];
};

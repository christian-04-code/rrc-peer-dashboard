import type { MarketFreshness, MarketObservation } from "@/lib/market/types";

export type StorageRegionId = "east" | "midwest" | "southCentral" | "mountain" | "pacific";

export type RegionalStorageMetric = {
  id: StorageRegionId;
  label: string;
  seriesId: string;
  unit: "Bcf";
  frequency: "weekly";
  status: "ok" | "unavailable";
  freshness: MarketFreshness;
  period: string | null;
  fetchedAt: string;
  current: number | null;
  priorWeek: number | null;
  weeklyChange: number | null;
  yearAgo: number | null;
  yearAgoPct: number | null;
  fiveYearAverage: number | null;
  fiveYearPct: number | null;
  history: MarketObservation[];
};

export type StateProductionMetric = {
  stateCode: string;
  stateName: string;
  unit: "MMcf/month";
  frequency: "monthly";
  status: "ok";
  period: string;
  fetchedAt: string;
  current: number;
  priorMonth: number | null;
  monthOverMonthPct: number | null;
  yearAgo: number | null;
  yearOverYearPct: number | null;
  history: MarketObservation[];
};

export type DemandSeriesId = "electricPower" | "industrial" | "residential" | "commercial";

export type DemandMetric = {
  id: DemandSeriesId;
  label: string;
  seriesId: string;
  unit: "MMcf/month";
  frequency: "monthly";
  status: "ok" | "unavailable";
  freshness: MarketFreshness;
  period: string | null;
  fetchedAt: string;
  history: MarketObservation[];
};

export type MacroFundamentalsResponse = {
  generatedAt: string;
  source: "U.S. EIA";
  storage: {
    status: "ok" | "unavailable";
    error?: string;
    regions: Record<StorageRegionId, RegionalStorageMetric>;
  };
  production: {
    status: "ok" | "unavailable";
    error?: string;
    measure: "Marketed natural gas production";
    states: Record<string, StateProductionMetric>;
  };
  demand: {
    status: "ok" | "unavailable";
    error?: string;
    series: Record<DemandSeriesId, DemandMetric>;
  };
};

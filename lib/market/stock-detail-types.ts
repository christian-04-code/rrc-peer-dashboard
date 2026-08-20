import type { Ticker } from "@/lib/dashboard/company-registry";

export type StockHistoryObservation = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type StockMetrics = {
  returns: { ytd: number | null; sixMonth: number | null; oneYear: number | null; threeYear: number | null; fiveYear: number | null };
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiveYearHigh: number | null;
  fiveYearLow: number | null;
  movingAverage50: number | null;
  movingAverage200: number | null;
  currentVsMovingAverage200: number | null;
  distanceFrom52WeekHigh: number | null;
  distanceFrom52WeekLow: number | null;
  averageVolume1y: number | null;
};

export type StockHistoryDataset = {
  schemaVersion: number;
  ticker: Ticker;
  source: { type: "workbook"; workbook: string; sheet: Ticker; priceBasis: "close"; workbookSha256: string };
  observationCount: number;
  earliestDate: string;
  latestDate: string;
  excludedPreTickerObservations: number;
  supplemental: { marketCap: number | null; marketCapSource: "workbook-cached-linked-data" | null };
  observations: StockHistoryObservation[];
};

export type StockDetailResponse = StockMetrics & {
  ticker: Ticker;
  companyName: string;
  currentPrice: number | null;
  quoteTimestamp: number | null;
  dailyChange: number | null;
  dailyChangePercent: number | null;
  marketCap: number | null;
  marketCapSource: "workbook-cached-linked-data" | null;
  history: {
    observations: StockHistoryObservation[];
    source: "Workbook";
    priceBasis: "close";
    earliestDate: string;
    latestDate: string;
  };
  generatedAt: string;
};

import type { NewsCategory, ProcessingStatus } from "@/lib/news/types";
import type { RangeImpactDirection, ImpactStrength, TimeHorizon } from "@/lib/news/ai/types";
import { IMPACT_DRIVERS, type ImpactDriverKey } from "@/lib/news/impact-framework";

/**
 * Client-facing article shape returned by GET /api/news. Deliberately a
 * standalone type (not imported from lib/news/persistence/articles-repo.ts,
 * which pulls in the pg-backed persistence layer) -- this file has zero
 * server-only dependencies and is safe to import from client components.
 */
export type NewsArticleDto = {
  id: string;
  canonicalUrl: string;
  headline: string;
  publisher: string;
  publishedAt: string | null;
  sourceTier: string;
  excerpt: string | null;
  category: NewsCategory[];
  relevanceScore: number;
  matchedKeywords: string[];
  matchedEntities: Array<{ ticker: string | null; label: string; kind: string }>;
  processingStatus: ProcessingStatus;
  aiSummary: string | null;
  rangeImpact: RangeImpactDirection | null;
  impactStrength: ImpactStrength | null;
  affectedDrivers: ImpactDriverKey[] | null;
  rangeAnalysis: string | null;
  timeHorizon: TimeHorizon | null;
  confidence: number | null;
  aiProvider: string | null;
  aiModel: string | null;
  aiAnalyzedAt: string | null;
  impactFrameworkVersion: string | null;
  analysisSchemaVersion: string | null;
};

export type NewsStatusDto =
  | { available: false; reason: "not_configured" | "no_run" | "error" }
  | {
      available: true;
      runId: string;
      runDate: string;
      startedAt: string;
      completedAt: string | null;
      status: string;
      sourcesAttempted: number;
      sourcesSuccessful: number;
      articlesDiscovered: number;
      duplicatesRemoved: number;
      articlesRejected: number;
      articlesRetained: number;
      aiAnalysesAttempted: number;
      aiAnalysesCompleted: number;
    };

export const NEWS_CATEGORY_FILTERS: Array<{ value: NewsCategory | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "range", label: "Range" },
  { value: "peers", label: "Peers" },
  { value: "natural_gas", label: "Natural Gas" },
  { value: "lng", label: "LNG" },
  { value: "appalachia", label: "Appalachia" },
  { value: "power_data_centers", label: "Power / Data Centers" },
  { value: "ngl", label: "NGL" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "regulatory", label: "Regulatory" }
];

const CATEGORY_LABELS: Record<NewsCategory, string> = {
  range: "Range",
  peers: "Peers",
  natural_gas: "Natural Gas",
  lng: "LNG",
  appalachia: "Appalachia",
  power_data_centers: "Power / Data Centers",
  ngl: "NGL",
  infrastructure: "Infrastructure",
  regulatory: "Regulatory"
};

export function categoryLabel(category: NewsCategory): string {
  return CATEGORY_LABELS[category] ?? category;
}

export const IMPACT_FILTERS: Array<{ value: RangeImpactDirection | "all"; label: string }> = [
  { value: "all", label: "All Impacts" },
  { value: "positive", label: "Positive" },
  { value: "negative", label: "Negative" },
  { value: "neutral", label: "Neutral" }
];

export const IMPACT_STRENGTH_FILTERS: Array<{ value: ImpactStrength | "all"; label: string }> = [
  { value: "all", label: "All Strengths" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" }
];

/** Reuses the versioned impact-framework driver labels -- the single source of truth defined in lib/news/impact-framework.ts -- rather than a second, independent label list. */
export function driverLabel(driver: ImpactDriverKey): string {
  return IMPACT_DRIVERS[driver]?.label ?? driver;
}

const TIME_HORIZON_LABELS: Record<TimeHorizon, string> = {
  near_term: "Near Term",
  medium_term: "Medium Term",
  long_term: "Long Term",
  multi_horizon: "Multi-Horizon"
};

export function timeHorizonLabel(horizon: TimeHorizon): string {
  return TIME_HORIZON_LABELS[horizon] ?? horizon;
}

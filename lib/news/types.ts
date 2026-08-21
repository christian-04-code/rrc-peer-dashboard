import type { Ticker } from "@/lib/dashboard/company-registry";

/** Source authority tiers, per docs/PHASE1 architecture: primary > major news > discovery. */
export type SourceTier = "tier1_primary" | "tier2_major_news" | "tier3_discovery";

export type NewsCategory =
  | "range"
  | "peers"
  | "natural_gas"
  | "lng"
  | "appalachia"
  | "power_data_centers"
  | "ngl"
  | "infrastructure"
  | "regulatory";

export const NEWS_CATEGORIES: readonly NewsCategory[] = [
  "range",
  "peers",
  "natural_gas",
  "lng",
  "appalachia",
  "power_data_centers",
  "ngl",
  "infrastructure",
  "regulatory"
];

export type ProcessingStatus =
  | "collected"
  | "rejected_duplicate"
  | "rejected_relevance"
  | "retained"
  | "analyzed"
  | "analysis_failed";

/**
 * What a source adapter hands back before any normalization. Deliberately
 * loose (publisher/url/timestamp are the only guarantees) -- adapters differ
 * wildly in what metadata their upstream actually provides, and normalization
 * is where "unavailable" becomes an explicit, typed state instead of a guess.
 */
export type RawArticle = {
  sourceId: string;
  sourceTier: SourceTier;
  headline: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  excerpt: string | null;
  rawPayload?: Record<string, unknown>;
};

/** The one shape everything downstream of collection operates on. */
export type NormalizedArticle = {
  fingerprint: string;
  canonicalUrl: string;
  normalizedUrl: string;
  headline: string;
  normalizedHeadline: string;
  publisher: string;
  originalSource: string;
  publishedAt: string | null;
  retrievedAt: string;
  sourceTier: SourceTier;
  excerpt: string | null;
};

export type MatchedEntity = {
  ticker: Ticker | null;
  label: string;
  kind: "ticker" | "company_name" | "topic";
};

export type TopicKeywordMatch = {
  topic: string;
  keywords: string[];
};

/**
 * Itemized signal breakdown behind a relevance decision (Phase 2.5). Kept
 * for auditability/tests, not surfaced in any UI yet: it's what lets a
 * borderline retain/reject call be explained -- which signal fired, where
 * it was found (headline vs. excerpt), and whether a source/geography bonus
 * contributed -- rather than trusting one opaque number.
 */
export type RelevanceSignals = {
  entityMatches: MatchedEntity[];
  headlineTopicMatches: TopicKeywordMatch[];
  excerptTopicMatches: TopicKeywordMatch[];
  distinctTopicsMatched: number;
  geographyMatches: string[];
  sourceTierBonus: number;
  isTier1Source: boolean;
};

export type RelevanceResult = {
  score: number;
  retained: boolean;
  matchedEntities: MatchedEntity[];
  matchedKeywords: string[];
  rejectionReason: string | null;
  retentionReason: string | null;
  signals: RelevanceSignals;
};

export type CategoryResult = {
  categories: NewsCategory[];
  reasoning: Record<NewsCategory, string[]>;
};

/** A normalized article carrying the deterministic scoring/classification produced before persistence. */
export type ScoredArticle = NormalizedArticle & {
  relevance: RelevanceResult;
  category: CategoryResult;
};

export type SourceCollectionOutcome = {
  sourceId: string;
  sourceTier: SourceTier;
  status: "ok" | "failed";
  articles: RawArticle[];
  error: string | null;
  durationMs: number;
};

export type PipelineRunStatus = "running" | "completed" | "completed_with_errors" | "failed";

export type PipelineRunSummary = {
  runId: string;
  runDate: string;
  startedAt: string;
  completedAt: string | null;
  status: PipelineRunStatus;
  sourcesAttempted: number;
  sourcesSuccessful: number;
  sourceFailures: Array<{ sourceId: string; error: string }>;
  articlesDiscovered: number;
  duplicatesRemoved: number;
  articlesRejected: number;
  articlesRetained: number;
  aiAnalysesAttempted: number;
  aiAnalysesCompleted: number;
  errors: string[];
  durationMs: number | null;
};

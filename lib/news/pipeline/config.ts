import relevanceConfig from "@/config/news-relevance.json";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Cost/scale safeguards, per the Phase 1 architecture decision that no
 * article reaches an AI call before deterministic filtering, and that
 * every run has a hard ceiling regardless of how much a source over-returns.
 * Env-overridable for manual testing; defaults match the approved
 * architecture (24-48h lookback).
 */
export const PIPELINE_CONFIG = {
  maxArticlesPerSource: envInt("NEWS_MAX_ARTICLES_PER_SOURCE", 25),
  maxRetainedArticlesPerRun: envInt("NEWS_MAX_RETAINED_PER_RUN", 60),
  maxAiAnalysesPerRun: envInt("NEWS_MAX_AI_ANALYSES_PER_RUN", 40),
  lookbackHours: envInt("NEWS_LOOKBACK_HOURS", 48),
  relevanceThreshold: relevanceConfig.retentionThreshold
};

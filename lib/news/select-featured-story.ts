import type { NewsArticleDto } from "@/lib/news/client-types";

/**
 * Deterministic pick of the single most-relevant, most-recent natural-gas
 * story for the Gas Balance card's compact news module (Macro UI cleanup
 * pass, 2026-09-22). Reuses the existing News pipeline's own persisted
 * category tag and processing status -- never re-analyzes or re-fetches an
 * article, never fabricates a headline/URL, and never surfaces an article
 * News itself rejected (rejected_duplicate/rejected_relevance/
 * analysis_failed) or hasn't finished collecting yet ("collected").
 */
export function selectFeaturedNaturalGasStory(articles: NewsArticleDto[] | null): NewsArticleDto | null {
  if (!articles) return null;
  const candidates = articles.filter(
    (article) => article.category.includes("natural_gas") && (article.processingStatus === "retained" || article.processingStatus === "analyzed")
  );
  if (candidates.length === 0) return null;
  // /api/news already returns published_at DESC, but re-sort defensively
  // (deterministic relevanceScore tie-break) rather than trusting caller order.
  return [...candidates].sort((a, b) => {
    const aTime = a.publishedAt ? Date.parse(a.publishedAt) : -Infinity;
    const bTime = b.publishedAt ? Date.parse(b.publishedAt) : -Infinity;
    if (aTime !== bTime) return bTime - aTime;
    return b.relevanceScore - a.relevanceScore;
  })[0];
}

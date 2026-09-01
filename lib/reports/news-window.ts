import type { ArticleRecord } from "@/lib/news/persistence/articles-repo";

/**
 * Deterministic weekly News inclusion window (Phase 7B). Anchored to the
 * report's own storage-week identity, not "today" -- the window is the
 * 7 calendar days ending at the storage week's own Friday (inclusive),
 * i.e. [storageWeekEnding - 6 days, storageWeekEnding]. Chosen to align
 * one-to-one with the EIA storage reporting cadence this report's whole
 * identity is built around (Phase 7A decision #1), rather than an
 * independent Mon-Sun or Sun-Sat calendar week that would drift out of
 * sync with the report's own week boundary.
 *
 * Only status "analyzed" articles are eligible -- i.e. articles that
 * already have a real, persisted Range-impact AI analysis
 * (lib/news/pipeline/analyze.ts, run on its own schedule, never re-run from
 * here). A "retained" article whose analysis is still pending is
 * deliberately excluded rather than included with fabricated/null impact
 * fields: this file's job is to select from what has already been safely
 * analyzed, not to decide what an unanalyzed article's impact might be.
 */
export const NEWS_WINDOW_DAYS = 7;

/** Caps the report's News evidence at a small, print-budget-appropriate set (Phase 7 product brief: 5-page hard maximum, dynamically selected content) -- not "all matching articles," which could be dozens in an eventful week. */
export const NEWS_WINDOW_MAX_ITEMS = 8;

export type NewsWindow = { start: string; end: string };

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeNewsWindow(storageWeekEnding: string): NewsWindow {
  const end = new Date(`${storageWeekEnding}T23:59:59.999Z`);
  const start = new Date(end.getTime() - (NEWS_WINDOW_DAYS - 1) * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

const IMPACT_STRENGTH_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/**
 * Ranks by impact strength first (from the article's own persisted AI
 * analysis, never re-derived here), then relevance score, then recency --
 * then caps at NEWS_WINDOW_MAX_ITEMS. `articles` is expected to already be
 * filtered to the window and to status "analyzed" by the caller's DB query
 * (see adapters/news-adapter.ts); this function re-validates both
 * conditions defensively rather than trusting the caller blindly.
 */
export function selectWeeklyNews(articles: ArticleRecord[], window: NewsWindow, maxItems = NEWS_WINDOW_MAX_ITEMS): ArticleRecord[] {
  const eligible = articles.filter(
    (article) => article.processingStatus === "analyzed" && article.publishedAt !== null && article.publishedAt >= window.start && article.publishedAt <= window.end
  );
  return [...eligible]
    .sort((a, b) => {
      const strengthDelta = (IMPACT_STRENGTH_RANK[a.impactStrength ?? ""] ?? 9) - (IMPACT_STRENGTH_RANK[b.impactStrength ?? ""] ?? 9);
      if (strengthDelta !== 0) return strengthDelta;
      if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
      return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
    })
    .slice(0, maxItems);
}

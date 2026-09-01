import type { ArticleRecord } from "@/lib/news/persistence/articles-repo";

/**
 * Deterministic weekly News inclusion window (Phase 7B, corrected in Phase
 * 7B.1). Anchored to the report's own DATA CUTOFF (`dataCutoffAt`, the
 * generation/freeze timestamp the snapshot builder establishes once per
 * run), NOT the storage-week identity Friday.
 *
 * Why the change: the EIA storage report for a Friday week-ending date is
 * normally released the following Thursday. A report generated after that
 * release must not omit the Saturday-through-Thursday News that occurred
 * between storage-week close and actual report generation -- anchoring the
 * window to `storageWeekEnding` (as Phase 7B originally did) would silently
 * drop that entire span. Report IDENTITY (`storageWeekEnding`, Phase 7A
 * decision #1) is unchanged and unaffected by this file; only News
 * *windowing* now follows the cutoff instead.
 *
 * Window boundary: **(previousDataCutoffAt, currentDataCutoffAt]** -- start
 * EXCLUSIVE, end INCLUSIVE. An article published exactly at the previous
 * report's cutoff was already eligible as of that cutoff (the previous
 * report's own end-inclusive boundary already covered it), so it must not
 * be eligible again; an article published exactly at the current cutoff is
 * new since the previous report and belongs in this one. This makes
 * consecutive reports' windows partition real time with no gap and no
 * double-count, by construction.
 *
 * `previousDataCutoffAt` must be the previous *published* report's own
 * frozen `data_cutoff_at` -- never independently recomputed here, and never
 * `Date.now()`. It is `null` only when no report has ever been published
 * (the very first report), in which case a documented deterministic
 * fallback of `NEWS_WINDOW_FALLBACK_DAYS` calendar days before
 * `currentDataCutoffAt` is used instead. Both `previousDataCutoffAt` and
 * `currentDataCutoffAt` are supplied by the snapshot builder, which
 * establishes ONE `dataCutoffAt` for the whole run (see
 * snapshot-builder.ts) -- this file never calls `new Date()` itself.
 *
 * Eligibility beyond the window: only status "analyzed" articles -- i.e.
 * articles that already have a real, persisted Range-impact AI analysis
 * (lib/news/pipeline/analyze.ts, run on its own schedule, never re-run from
 * here). A "retained" article whose analysis is still pending is
 * deliberately excluded rather than included with fabricated/null impact
 * fields.
 */
export const NEWS_WINDOW_FALLBACK_DAYS = 7;

/** Caps the report's News evidence at a small, print-budget-appropriate set (Phase 7 product brief: 5-page hard maximum, dynamically selected content) -- not "all matching articles," which could be dozens in an eventful week. */
export const NEWS_WINDOW_MAX_ITEMS = 8;

export type NewsWindow = { start: string; end: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `previousDataCutoffAt`: the previous published report's `data_cutoff_at`,
 * or `null` for the first-ever report. `currentDataCutoffAt`: this run's
 * own established cutoff (see snapshot-builder.ts). Both must be real ISO
 * timestamps supplied by the caller -- this function performs no fetching
 * and no current-time lookup of its own.
 */
export function computeNewsWindow(previousDataCutoffAt: string | null, currentDataCutoffAt: string): NewsWindow {
  if (previousDataCutoffAt) {
    return { start: previousDataCutoffAt, end: currentDataCutoffAt };
  }
  const fallbackStart = new Date(new Date(currentDataCutoffAt).getTime() - NEWS_WINDOW_FALLBACK_DAYS * DAY_MS).toISOString();
  return { start: fallbackStart, end: currentDataCutoffAt };
}

const IMPACT_STRENGTH_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/**
 * Ranks by impact strength first (from the article's own persisted AI
 * analysis, never re-derived here), then relevance score, then recency --
 * then caps at NEWS_WINDOW_MAX_ITEMS. `articles` is expected to already be
 * filtered to (a superset of) the window and to status "analyzed" by the
 * caller's DB query (see adapters/news-adapter.ts); this function
 * re-validates status defensively and applies the window's own precise
 * exclusive-start/inclusive-end boundary itself, rather than trusting the
 * caller's DB query (which uses `>=`/`<=` on both ends for a safe superset)
 * to have applied the exact semantics.
 */
export function selectWeeklyNews(articles: ArticleRecord[], window: NewsWindow, maxItems = NEWS_WINDOW_MAX_ITEMS): ArticleRecord[] {
  const eligible = articles.filter(
    (article) => article.processingStatus === "analyzed" && article.publishedAt !== null && article.publishedAt > window.start && article.publishedAt <= window.end
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

"use client";

import { useMemo, useRef, useState } from "react";
import { useNewsArticles } from "@/lib/news/use-news-articles";
import { useNewsStatus } from "@/lib/news/use-news-status";
import type { NewsArticleDto } from "@/lib/news/client-types";
import { selectDisplayableArticles } from "@/lib/news/article-display";
import { DailyIntelligenceHeader } from "@/components/news/DailyIntelligenceHeader";
import { ArticleCard } from "@/components/news/ArticleCard";
import { NewsDetailDrawer } from "@/components/news/NewsDetailDrawer";

/**
 * Deliberately simplified: this is the complete daily feed, unfiltered.
 * Category/impact/strength filter controls were removed from the primary
 * News experience so the page reads as a feed to scan, not a dashboard to
 * configure -- the underlying filter data/logic (NEWS_CATEGORY_FILTERS,
 * IMPACT_FILTERS, IMPACT_STRENGTH_FILTERS, filterArticles, NewsFilters.tsx)
 * is untouched and still exported/tested, just unrendered here, matching
 * how components/dashboard/PeersPanel.tsx was preserved unrouted rather
 * than deleted.
 */
export function NewsPanel() {
  const { articles, loading, error, notConfigured } = useNewsArticles(100);
  const { status, loading: statusLoading } = useNewsStatus();
  const [expanded, setExpanded] = useState<NewsArticleDto | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Sort order is inherited from GET /api/news (published_at DESC) --
  // deliberately no client-side re-ranking on top of backend order.
  const displayable = useMemo(() => selectDisplayableArticles(articles ?? []), [articles]);

  return (
    <div className="news-panel">
      <DailyIntelligenceHeader status={status} loading={statusLoading} />

      {loading ? (
        <p className="muted news-loading">Loading news…</p>
      ) : error ? (
        <p className="muted news-empty-state">News feed temporarily unavailable. Try again shortly.</p>
      ) : notConfigured ? (
        <p className="muted news-empty-state">News storage is not configured yet.</p>
      ) : displayable.length === 0 ? (
        <p className="muted news-empty-state">No completed news run is available yet.</p>
      ) : (
        <>
          <h3 className="news-feed-heading">All News</h3>
          <div className="news-card-grid">
            {displayable.map((article) => (
              <ArticleCard key={article.id} article={article} onExpand={() => setExpanded(article)} />
            ))}
          </div>
        </>
      )}

      <NewsDetailDrawer article={expanded} onClose={() => setExpanded(null)} closeButtonRef={closeButtonRef} />
    </div>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import { useNewsArticles } from "@/lib/news/use-news-articles";
import { useNewsStatus } from "@/lib/news/use-news-status";
import type { NewsArticleDto } from "@/lib/news/client-types";
import { selectDisplayableArticles, filterArticles, type NewsFilterState } from "@/lib/news/article-display";
import { DailyIntelligenceHeader } from "@/components/news/DailyIntelligenceHeader";
import { NewsFilters } from "@/components/news/NewsFilters";
import { ArticleCard } from "@/components/news/ArticleCard";
import { NewsDetailDrawer } from "@/components/news/NewsDetailDrawer";

export function NewsPanel() {
  const { articles, loading, error, notConfigured } = useNewsArticles(100);
  const { status, loading: statusLoading } = useNewsStatus();
  const [filters, setFilters] = useState<NewsFilterState>({ category: "all", impact: "all", strength: "all" });
  const [expanded, setExpanded] = useState<NewsArticleDto | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const displayable = useMemo(() => selectDisplayableArticles(articles ?? []), [articles]);

  // Sort order is inherited from GET /api/news (published_at DESC) --
  // deliberately no client-side re-ranking on top of backend order.
  const filtered = useMemo(() => filterArticles(displayable, filters), [displayable, filters]);

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
          <NewsFilters filters={filters} onChange={setFilters} />

          {filtered.length === 0 ? (
            <p className="muted news-empty-state">No relevant stories found for this filter.</p>
          ) : (
            <div className="news-card-grid">
              {filtered.map((article) => (
                <ArticleCard key={article.id} article={article} onExpand={() => setExpanded(article)} />
              ))}
            </div>
          )}
        </>
      )}

      <NewsDetailDrawer article={expanded} onClose={() => setExpanded(null)} closeButtonRef={closeButtonRef} />
    </div>
  );
}

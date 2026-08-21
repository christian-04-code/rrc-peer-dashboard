"use client";

import { useEffect, useState } from "react";
import type { NewsArticleDto } from "@/lib/news/client-types";

export type NewsArticlesState = {
  articles: NewsArticleDto[] | null;
  loading: boolean;
  error: string | null;
  /** True specifically when the backend reports storage isn't configured (503) -- distinct from a generic fetch error or "no rows for this filter", so the UI can show the right empty-state copy. */
  notConfigured: boolean;
};

/**
 * Read-only: fetches already-persisted articles from GET /api/news. Never
 * triggers collection or AI analysis -- opening the News tab only reads
 * what a prior pipeline run already stored.
 */
export function useNewsArticles(limit = 100): NewsArticlesState {
  const [state, setState] = useState<NewsArticlesState>({ articles: null, loading: true, error: null, notConfigured: false });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/news?limit=${limit}`, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (response.status === 503) return { notConfigured: true, articles: [] as NewsArticleDto[] };
        if (!response.ok) throw new Error(`News API returned ${response.status}`);
        const data = (await response.json()) as { articles: NewsArticleDto[] };
        return { notConfigured: false, articles: data.articles };
      })
      .then((data) => setState({ articles: data.articles, loading: false, error: null, notConfigured: data.notConfigured }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ articles: null, loading: false, error: error instanceof Error ? error.message : "News feed unavailable", notConfigured: false });
      });
    return () => controller.abort();
  }, [limit]);

  return state;
}

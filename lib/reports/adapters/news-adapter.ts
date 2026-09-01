import type { Pool } from "pg";
import { queryArticles, type ArticleRecord } from "@/lib/news/persistence/articles-repo";
import { computeNewsWindow, selectWeeklyNews, NEWS_WINDOW_MAX_ITEMS } from "@/lib/reports/news-window";
import type { SourceManifestEntry, WeeklyEvidenceItem } from "@/lib/reports/weekly-report-types";

/**
 * News evidence collection (category "news", optional input -- Phase 7A
 * decision #6). Reuses News's own persisted, validated Range-impact AI
 * analysis (lib/news/persistence/articles-repo.ts) read-only; never
 * re-runs News's AI, never re-derives relevance/dedup (both already done
 * by News's own pipeline before an article reaches status "analyzed"). See
 * news-window.ts for the window/selection rules this adapter delegates to.
 */

function articleDisplayValue(article: ArticleRecord): string {
  return article.rangeImpact ?? "No range impact classification";
}

function toEvidenceItem(article: ArticleRecord): WeeklyEvidenceItem {
  return {
    evidenceId: `news:article:${article.id}`,
    category: "news",
    metricKey: "article",
    label: article.headline,
    currentValue: null,
    displayValue: articleDisplayValue(article),
    unit: null,
    period: article.publishedAt,
    asOfDate: article.publishedAt ? article.publishedAt.slice(0, 10) : null,
    sourceIds: ["news_articles"],
    freshness: "current",
    comparisons: [],
    rangeDrivers: article.affectedDrivers ?? [],
    materialityInputs: {
      isNewThisWeek: false,
      changedSincePreviousReport: false,
      riskSeverityRank: null,
      riskState: null,
      rangeImpactDirection: article.rangeImpact,
      rangeImpactStrength: article.impactStrength,
      comparisonMagnitudePct: null
    },
    metadata: {
      publisher: article.publisher,
      canonicalUrl: article.canonicalUrl,
      excerpt: article.excerpt,
      category: article.category,
      confidence: article.confidence,
      rangeAnalysis: article.rangeAnalysis,
      timeHorizon: article.timeHorizon
    }
  };
}

export type NewsCollection = {
  items: WeeklyEvidenceItem[];
  manifestEntries: SourceManifestEntry[];
  windowStart: string;
  windowEnd: string;
  present: boolean;
};

export async function collectNewsEvidence(pool: Pool | null, storageWeekEnding: string): Promise<NewsCollection> {
  const window = computeNewsWindow(storageWeekEnding);
  if (!pool) {
    return {
      items: [],
      manifestEntries: [{ key: "news_articles", label: "Retained/analyzed News articles", period: `${window.start.slice(0, 10)}..${window.end.slice(0, 10)}`, freshness: "unavailable", included: false }],
      windowStart: window.start,
      windowEnd: window.end,
      present: false
    };
  }

  let candidates: ArticleRecord[] = [];
  try {
    candidates = await queryArticles(pool, { since: window.start, until: window.end, status: "analyzed", limit: 200 });
  } catch {
    candidates = [];
  }

  const selected = selectWeeklyNews(candidates, window, NEWS_WINDOW_MAX_ITEMS);
  const items = selected.map(toEvidenceItem);

  const manifestEntries: SourceManifestEntry[] = [
    {
      key: "news_articles",
      label: "Retained/analyzed News articles",
      period: `${window.start.slice(0, 10)}..${window.end.slice(0, 10)}`,
      freshness: "current",
      included: items.length > 0
    }
  ];

  return { items, manifestEntries, windowStart: window.start, windowEnd: window.end, present: items.length > 0 };
}

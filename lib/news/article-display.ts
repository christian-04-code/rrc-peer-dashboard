import type { NewsArticleDto } from "@/lib/news/client-types";
import type { NewsCategory, ProcessingStatus } from "@/lib/news/types";
import type { RangeImpactDirection, ImpactStrength } from "@/lib/news/ai/types";

/**
 * Pure display-logic helpers, deliberately framework-agnostic (no React
 * import) so they're directly testable with plain node:test -- this repo
 * has no React-rendering test infrastructure (no jsdom/testing-library),
 * and extracting the logic here avoids either adding one or falling back
 * to brittle source-string assertions for this behavior.
 */

/** 'collected' and 'rejected_*' are internal pipeline states, never shown to a user -- this filters by an already-computed backend status, it does not re-classify anything. */
const DISPLAYABLE_STATUSES: ReadonlySet<ProcessingStatus> = new Set(["retained", "analyzed", "analysis_failed"]);

export function isDisplayableStatus(status: ProcessingStatus): boolean {
  return DISPLAYABLE_STATUSES.has(status);
}

export type NewsFilterState = {
  category: NewsCategory | "all";
  impact: RangeImpactDirection | "all";
  strength: ImpactStrength | "all";
};

export function selectDisplayableArticles(articles: NewsArticleDto[]): NewsArticleDto[] {
  return articles.filter((article) => isDisplayableStatus(article.processingStatus));
}

/** Filters an already-displayable article list. Does not re-sort -- callers keep whatever order GET /api/news already returned (published_at DESC). */
export function filterArticles(articles: NewsArticleDto[], filters: NewsFilterState): NewsArticleDto[] {
  return articles.filter((article) => {
    if (filters.category !== "all" && !article.category.includes(filters.category)) return false;
    if (filters.impact !== "all" && article.rangeImpact !== filters.impact) return false;
    if (filters.strength !== "all" && article.impactStrength !== filters.strength) return false;
    return true;
  });
}

export function formatArticleDate(iso: string | null): string {
  if (!iso) return "Undated";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Undated";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** A text symbol, never color alone, so impact direction reads without relying on color perception. */
export function impactSymbol(impact: RangeImpactDirection): string {
  if (impact === "positive") return "▲";
  if (impact === "negative") return "▼";
  return "●";
}

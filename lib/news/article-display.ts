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

/**
 * Word-boundary-aware truncation for the collapsed card's short preview line
 * (Phase 5.2: cards are collapsed by default; this is the "short takeaway"
 * derived from the already-persisted excerpt, not a second AI-generated
 * summary). Returns the input unchanged if it already fits.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.trimEnd()}…`;
}

/** A text symbol, never color alone, so impact direction reads without relying on color perception. */
export function impactSymbol(impact: RangeImpactDirection): string {
  if (impact === "positive") return "▲";
  if (impact === "negative") return "▼";
  return "●";
}

export type ImpactTone = "positive" | "negative" | "caution" | "neutral";

/**
 * Deterministic headline-color rule (News UI simplification). Uses only the
 * two existing categorical AI fields already on every analyzed article --
 * rangeImpact and impactStrength -- never a newly invented numeric
 * confidence cutoff, per the existing "impactStrength is the AI's own
 * low/medium/high judgment of how big a deal this is for Range" semantics
 * already established in lib/news/ai/anthropic-provider.ts's system prompt.
 *
 * Rule, in order:
 * 1. No AI result yet (unanalyzed or a failed analysis -- rangeImpact is
 *    null in both) -> "neutral": nothing to signal, never fabricated.
 * 2. rangeImpact === "neutral" -> "caution": explicitly not a directional
 *    call.
 * 3. rangeImpact is "positive"/"negative" but impactStrength is not
 *    "medium" or "high" (i.e. "low", or -- defensively -- missing) ->
 *    "caution": a low-strength directional call reads as "worth noting",
 *    not a materially meaningful move.
 * 4. Otherwise (positive/negative at medium or high strength) -> that
 *    direction.
 */
export function rangeImpactTone(article: { rangeImpact: RangeImpactDirection | null; impactStrength: ImpactStrength | null }): ImpactTone {
  if (!article.rangeImpact) return "neutral";
  if (article.rangeImpact === "neutral") return "caution";
  if (article.impactStrength !== "medium" && article.impactStrength !== "high") return "caution";
  return article.rangeImpact;
}

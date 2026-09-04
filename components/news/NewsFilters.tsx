"use client";

/**
 * Preserved but currently unrouted: NewsPanel.tsx no longer renders this
 * component (the News UI simplification removed the category/impact/
 * strength filter rows from the primary feed). Kept on disk rather than
 * deleted, same as components/dashboard/PeersPanel.tsx -- the underlying
 * filter data/logic it depends on (NEWS_CATEGORY_FILTERS, IMPACT_FILTERS,
 * IMPACT_STRENGTH_FILTERS, filterArticles) is untouched and still tested.
 */

import { NEWS_CATEGORY_FILTERS, IMPACT_FILTERS, IMPACT_STRENGTH_FILTERS } from "@/lib/news/client-types";
import type { NewsFilterState } from "@/lib/news/article-display";

export function NewsFilters({
  filters,
  onChange
}: {
  filters: NewsFilterState;
  onChange: (next: NewsFilterState) => void;
}) {
  return (
    <div className="news-filters">
      <div className="tabs news-category-tabs" role="group" aria-label="Filter by category">
        {NEWS_CATEGORY_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={filters.category === option.value ? "active" : ""}
            aria-pressed={filters.category === option.value}
            onClick={() => onChange({ ...filters, category: option.value })}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="news-filters-row">
        <div className="tabs news-impact-tabs" role="group" aria-label="Filter by Range impact">
          {IMPACT_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={filters.impact === option.value ? "active" : ""}
              aria-pressed={filters.impact === option.value}
              onClick={() => onChange({ ...filters, impact: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="tabs news-strength-tabs" role="group" aria-label="Filter by impact strength">
          {IMPACT_STRENGTH_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={filters.strength === option.value ? "active" : ""}
              aria-pressed={filters.strength === option.value}
              onClick={() => onChange({ ...filters, strength: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

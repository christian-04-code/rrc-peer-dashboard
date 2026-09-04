"use client";

import { useState } from "react";

/**
 * Copy verified against actual implementation (Phase 5.2), not assumptions:
 * - Refresh: vercel.json's single cron entry (schedule "15 11 * * *" UTC),
 *   which triggers the scheduled news route's runDailyNewsOrchestration
 *   (lib/news/pipeline/orchestrate.ts). This file never calls that route --
 *   see tests/news-ui-read-only.test.cjs.
 * - Sources: lib/news/sources/index.ts's getDefaultSourceAdapters() -- the
 *   SEC EDGAR adapter is registered there too, but only when SEC_USER_AGENT
 *   is set; it is NOT set on this project's Vercel env (confirmed via
 *   `vercel env ls`), so it's deliberately omitted here rather than listed
 *   as if active.
 * - Selection: lib/news/pipeline/runner.ts's collect -> normalize -> dedupe
 *   -> scoreRelevance -> retained/rejected split, and
 *   lib/news/pipeline/analyze.ts's analyzeEligibleArticles, which only ever
 *   selects processing_status = 'retained' rows.
 * - Colors: lib/news/article-display.ts's rangeImpactTone() (Phase 5.1),
 *   unchanged here.
 * - Sorting: lib/news/persistence/articles-repo.ts's queryArticles(), whose
 *   SQL is `ORDER BY published_at DESC NULLS LAST`.
 * - History: no DELETE statement exists anywhere in lib/news/persistence/ --
 *   articles are never removed. GET /api/news is called as
 *   `/api/news?limit=100` (lib/news/use-news-articles.ts), and the News tab
 *   additionally hides any row whose processing_status isn't
 *   retained/analyzed/analysis_failed (selectDisplayableArticles) -- so the
 *   visible feed is capped by that fetch limit, not a time window or a
 *   cleanup job.
 */
const FEED_INFO_SECTIONS: Array<{ label: string; text: string }> = [
  {
    label: "Refresh",
    text: "Collected automatically once a day, in the early morning Central time. The exact minute can shift by up to an hour with daylight saving time and normal scheduling variance."
  },
  {
    label: "Sources",
    text: "EIA Today in Energy, Natural Gas Intelligence, and OilPrice.com."
  },
  {
    label: "Selection",
    text: "Every story is deduplicated and screened against a set of relevance rules first. Only stories that pass that screening are sent for Range-impact analysis -- AI never decides what enters the system."
  },
  {
    label: "Colors",
    text: "Green: meaningful positive impact for Range. Red: meaningful negative impact. Amber: neutral, low-strength, or mixed/uncertain. Default: not yet analyzed. None of this is a stock-price prediction."
  },
  {
    label: "Sorting",
    text: "Newest published stories first."
  },
  {
    label: "History",
    text: "Articles are never deleted. The feed shows the most recently published stories that passed screening -- older stories fall out of view as new ones are collected."
  }
];

export function FeedInfoDisclosure() {
  const [open, setOpen] = useState(false);
  const panelId = "news-how-it-works-panel";

  return (
    <div className="news-info-disclosure">
      <button
        type="button"
        className="news-info-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="news-info-icon" aria-hidden="true">
          ⓘ
        </span>
        How this feed works
      </button>

      {open ? (
        <div id={panelId} className="news-info-panel" role="region" aria-label="How this feed works">
          <dl>
            {FEED_INFO_SECTIONS.map((section) => (
              <div key={section.label} className="news-info-row">
                <dt>{section.label}</dt>
                <dd>{section.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

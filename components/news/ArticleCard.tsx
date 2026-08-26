"use client";

import { useState } from "react";
import type { NewsArticleDto } from "@/lib/news/client-types";
import { categoryLabel, driverLabel, timeHorizonLabel } from "@/lib/news/client-types";
import { formatArticleDate, impactSymbol, rangeImpactTone, truncateText } from "@/lib/news/article-display";
import type { ImpactDriverKey } from "@/lib/news/impact-framework";

/** Roughly 1-2 lines at the card's font size/width -- a scan-level preview, not a second summary. */
const EXCERPT_PREVIEW_LENGTH = 130;

export function ArticleCard({ article, onExpand }: { article: NewsArticleDto; onExpand: () => void }) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const primaryCategory = article.category[0];
  const isAnalyzed = article.processingStatus === "analyzed";
  const isFailed = article.processingStatus === "analysis_failed";
  const hasAnalysis = isAnalyzed && Boolean(article.rangeImpact) && Boolean(article.impactStrength);
  const tone = rangeImpactTone(article);

  const excerptPreview = article.excerpt ? truncateText(article.excerpt, EXCERPT_PREVIEW_LENGTH) : null;
  const summaryPanelId = `news-summary-${article.id}`;
  const analysisPanelId = `news-analysis-${article.id}`;

  return (
    <article className="news-card panel">
      <div className="news-card-eyebrow">
        {primaryCategory ? <span className="badge">{categoryLabel(primaryCategory)}</span> : null}
        {article.category.slice(1).map((category) => (
          <span className="badge news-card-secondary-category" key={category}>
            {categoryLabel(category)}
          </span>
        ))}
      </div>

      <button type="button" className={`news-card-headline news-headline-${tone}`} onClick={onExpand}>
        {article.headline}
      </button>

      <p className="news-card-byline muted">
        {article.publisher} · {formatArticleDate(article.publishedAt)}
      </p>

      {/* Always-visible semantic signal (Phase 5.2: no longer hidden behind
          "Show Range analysis" -- the collapsed card must still show the
          impact badge, or a safe pending/failed indicator). */}
      <div className="news-card-signal">
        {hasAnalysis && article.rangeImpact && article.impactStrength ? (
          <span className={`news-impact-pill news-impact-${article.rangeImpact}`}>
            {impactSymbol(article.rangeImpact)} {article.rangeImpact.toUpperCase()} · {article.impactStrength.toUpperCase()}
          </span>
        ) : isFailed ? (
          <span className="news-status-chip muted">Analysis Unavailable</span>
        ) : (
          <span className="news-status-chip muted">Analysis Pending</span>
        )}
      </div>

      {excerptPreview ? <p className="news-card-preview">{excerptPreview}</p> : null}

      <div className="news-card-controls">
        <button
          type="button"
          className="news-card-toggle"
          aria-expanded={summaryOpen}
          aria-controls={summaryPanelId}
          onClick={() => setSummaryOpen((open) => !open)}
        >
          {summaryOpen ? "Hide summary" : "Show summary"}
        </button>
        {hasAnalysis ? (
          <button
            type="button"
            className="news-card-toggle"
            aria-expanded={analysisOpen}
            aria-controls={analysisPanelId}
            onClick={() => setAnalysisOpen((open) => !open)}
          >
            {analysisOpen ? "Hide Range analysis" : "Show Range analysis"}
          </button>
        ) : null}
      </div>

      {summaryOpen ? (
        <div className="news-card-section" id={summaryPanelId}>
          <h4 className="news-card-label">Factual Summary</h4>
          <p className="news-card-excerpt">{article.excerpt ?? "No excerpt available from the source."}</p>
        </div>
      ) : null}

      {analysisOpen && hasAnalysis && article.rangeImpact && article.impactStrength ? (
        <div className="news-card-section news-range-impact" id={analysisPanelId} aria-label="AI-generated Range impact analysis">
          <h4 className="news-card-label news-ai-label">AI Range Analysis</h4>
          <p className="news-card-analysis">{article.rangeAnalysis}</p>
          <dl className="news-impact-meta">
            {article.affectedDrivers && article.affectedDrivers.length > 0 ? (
              <div>
                <dt>Affected Drivers</dt>
                <dd>{article.affectedDrivers.map((driver) => driverLabel(driver as ImpactDriverKey)).join(", ")}</dd>
              </div>
            ) : null}
            {article.timeHorizon ? (
              <div>
                <dt>Time Horizon</dt>
                <dd>{timeHorizonLabel(article.timeHorizon)}</dd>
              </div>
            ) : null}
            {article.confidence !== null ? (
              <div>
                <dt>
                  Confidence
                  <span className="news-confidence-help" title="Confidence reflects confidence in the inferred business impact on Range, not expected stock-price direction.">
                    ⓘ
                  </span>
                </dt>
                <dd>{Math.round(article.confidence * 100)}%</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      <div className="news-card-footer">
        {article.canonicalUrl ? (
          <a href={article.canonicalUrl} target="_blank" rel="noopener noreferrer" className="news-view-original">
            View Original →
          </a>
        ) : null}
      </div>
    </article>
  );
}

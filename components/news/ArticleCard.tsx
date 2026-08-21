"use client";

import type { NewsArticleDto } from "@/lib/news/client-types";
import { categoryLabel, driverLabel, timeHorizonLabel } from "@/lib/news/client-types";
import { formatArticleDate, impactSymbol } from "@/lib/news/article-display";
import type { ImpactDriverKey } from "@/lib/news/impact-framework";

export function ArticleCard({ article, onExpand }: { article: NewsArticleDto; onExpand: () => void }) {
  const primaryCategory = article.category[0];
  const isAnalyzed = article.processingStatus === "analyzed";
  const isFailed = article.processingStatus === "analysis_failed";

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

      <button type="button" className="news-card-headline" onClick={onExpand}>
        {article.headline}
      </button>

      <p className="news-card-byline muted">
        {article.publisher} · {formatArticleDate(article.publishedAt)}
      </p>

      <div className="news-card-section">
        <h4 className="news-card-label">Factual Summary</h4>
        <p className="news-card-excerpt">{article.excerpt ?? "No excerpt available from the source."}</p>
      </div>

      {isAnalyzed && article.rangeImpact && article.impactStrength ? (
        <div className="news-card-section news-range-impact" aria-label="AI-generated Range impact analysis">
          <h4 className="news-card-label news-ai-label">AI Range Analysis</h4>
          <div className="news-impact-headline">
            <span className={`news-impact-pill news-impact-${article.rangeImpact}`}>
              {impactSymbol(article.rangeImpact)} {article.rangeImpact.toUpperCase()} · {article.impactStrength.toUpperCase()}
            </span>
          </div>
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
      ) : isFailed ? (
        <div className="news-card-section news-analysis-state news-analysis-failed">
          <h4 className="news-card-label news-ai-label">AI Range Analysis</h4>
          <p className="muted">Analysis Unavailable</p>
        </div>
      ) : (
        <div className="news-card-section news-analysis-state news-analysis-pending">
          <h4 className="news-card-label news-ai-label">AI Range Analysis</h4>
          <p className="muted">Analysis Pending</p>
        </div>
      )}

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

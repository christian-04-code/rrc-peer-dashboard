"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { NewsArticleDto } from "@/lib/news/client-types";
import { categoryLabel, driverLabel, timeHorizonLabel } from "@/lib/news/client-types";
import { rangeImpactTone } from "@/lib/news/article-display";
import type { ImpactDriverKey } from "@/lib/range-impact-framework";

/**
 * A self-contained drawer for News article detail, styled with the same
 * .drawer/.drawer-backdrop classes DetailDrawer.tsx uses, but kept as its
 * own component rather than extending DetailDrawer's DrawerContent union
 * (which is guidance-panel-specific) -- additive, no risk to the existing
 * drawer's behavior.
 */
export function NewsDetailDrawer({
  article,
  onClose,
  closeButtonRef
}: {
  article: NewsArticleDto | null;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement>;
}) {
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const drawerNode = drawerRef.current;
    if (!article || !drawerNode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = drawerNode.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    drawerNode.addEventListener("keydown", onKeyDown);
    return () => drawerNode.removeEventListener("keydown", onKeyDown);
  }, [article, onClose]);

  if (!article) return null;

  const tone = rangeImpactTone(article);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        ref={drawerRef}
        className="drawer news-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="news-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button ref={closeButtonRef} onClick={onClose}>
          Close
        </button>
        <p className="muted news-drawer-category">{article.category.map(categoryLabel).join(" · ") || "Uncategorized"}</p>
        <h2 id="news-drawer-title" className={`news-headline-${tone}`}>
          {article.headline}
        </h2>
        <p className="muted drawer-source">
          {article.publisher}
          {article.publishedAt ? ` · ${new Date(article.publishedAt).toLocaleString()}` : ""}
        </p>

        <section className="news-drawer-section">
          <h3>Factual Summary</h3>
          <p>{article.excerpt ?? "No excerpt available from the source."}</p>
        </section>

        {article.processingStatus === "analyzed" && article.rangeImpact ? (
          <section className="news-drawer-section">
            <h3 className="news-ai-label">AI Range Analysis</h3>
            <p className={`news-impact-pill news-impact-${article.rangeImpact}`}>
              {article.rangeImpact.toUpperCase()} · {article.impactStrength?.toUpperCase()}
            </p>
            <p>{article.rangeAnalysis}</p>
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
                  <dt>Confidence</dt>
                  <dd>{Math.round(article.confidence * 100)}%</dd>
                </div>
              ) : null}
            </dl>
            <p className="muted news-confidence-disclaimer">
              Confidence reflects confidence in the inferred business impact on Range, not expected stock-price direction.
            </p>
          </section>
        ) : article.processingStatus === "analysis_failed" ? (
          <section className="news-drawer-section">
            <h3>AI Range Analysis</h3>
            <p className="muted">Analysis Unavailable</p>
          </section>
        ) : (
          <section className="news-drawer-section">
            <h3>AI Range Analysis</h3>
            <p className="muted">Analysis Pending</p>
          </section>
        )}

        <section className="news-drawer-section news-drawer-audit">
          <h3>Audit</h3>
          <dl className="news-impact-meta">
            <div>
              <dt>Relevance Score</dt>
              <dd>{article.relevanceScore}</dd>
            </div>
            {article.matchedEntities.length > 0 ? (
              <div>
                <dt>Matched Entities</dt>
                <dd>{article.matchedEntities.map((entity) => entity.label).join(", ")}</dd>
              </div>
            ) : null}
            {article.matchedKeywords.length > 0 ? (
              <div>
                <dt>Matched Keywords</dt>
                <dd>{article.matchedKeywords.join(", ")}</dd>
              </div>
            ) : null}
            {article.aiModel ? (
              <div>
                <dt>AI Model</dt>
                <dd>
                  {article.aiProvider} · {article.aiModel}
                </dd>
              </div>
            ) : null}
            {article.aiAnalyzedAt ? (
              <div>
                <dt>Analyzed</dt>
                <dd>{new Date(article.aiAnalyzedAt).toLocaleString()}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {article.canonicalUrl ? (
          <a href={article.canonicalUrl} target="_blank" rel="noopener noreferrer" className="news-view-original">
            View Original →
          </a>
        ) : null}
      </aside>
    </div>
  );
}

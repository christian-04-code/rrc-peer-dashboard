"use client";

import type { NewsStatusDto } from "@/lib/news/client-types";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

function statusLabel(status: string): string {
  if (status === "completed") return "Complete";
  if (status === "completed_with_errors") return "Completed with errors";
  if (status === "running") return "Running";
  if (status === "failed") return "Failed";
  return status;
}

export function DailyIntelligenceHeader({ status, loading }: { status: NewsStatusDto | null; loading: boolean }) {
  return (
    <section className="news-header panel" aria-label="Daily energy intelligence status">
      <div className="news-header-title">
        <h2>Daily Energy Intelligence</h2>
        {status && status.available && <span className={`badge news-status-badge news-status-${status.status}`}>{statusLabel(status.status)}</span>}
      </div>

      {loading ? (
        <p className="muted">Loading pipeline status…</p>
      ) : !status || !status.available ? (
        <p className="muted news-header-empty">
          {status?.reason === "not_configured" ? "News storage is not configured yet." : "No completed news run is available yet."}
        </p>
      ) : (
        <div className="news-header-stats">
          <div className="news-header-stat">
            <span>Last Updated</span>
            <strong>{status.completedAt ? formatTimestamp(status.completedAt) : formatTimestamp(status.startedAt)}</strong>
          </div>
          <div className="news-header-stat">
            <span>Scanned</span>
            <strong>{status.articlesDiscovered}</strong>
          </div>
          <div className="news-header-stat">
            <span>Relevant</span>
            <strong>{status.articlesRetained}</strong>
          </div>
          <div className="news-header-stat">
            <span>Analyzed</span>
            <strong>
              {status.aiAnalysesCompleted}
              {status.aiAnalysesAttempted > status.aiAnalysesCompleted ? (
                <small className="muted"> / {status.aiAnalysesAttempted} attempted</small>
              ) : null}
            </strong>
          </div>
          {status.aiAnalysesAttempted > status.aiAnalysesCompleted ? (
            <div className="news-header-stat">
              <span>Failed Analyses</span>
              <strong className="negative">{status.aiAnalysesAttempted - status.aiAnalysesCompleted}</strong>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

"use client";

import type { MacroRiskResponse } from "@/app/api/macro/risk/route";
import type { RangeMacroSignalKey, RangeMacroSignalState } from "@/lib/market/macro-risk-engine";
import { formatDataDate, formatRefreshTimestamp } from "@/lib/market/format-dates";

const STATE_LABELS: Record<RangeMacroSignalState, string> = {
  HIGH_RISK: "High Risk",
  MODERATE_RISK: "Moderate Risk",
  WATCH: "Watch",
  SUPPORTIVE: "Supportive",
  UNAVAILABLE: "Unavailable"
};

function stateClass(state: RangeMacroSignalState): string {
  return state.toLowerCase().replace(/_/g, "-");
}

export function MacroRiskWidget({
  data,
  loading,
  error,
  onViewDriver
}: {
  data: MacroRiskResponse | null;
  loading: boolean;
  error: string | null;
  onViewDriver: (driver: RangeMacroSignalKey) => void;
}) {
  if (loading) return <div className="macro-chart-empty">--<small>Loading Range macro risk signals…</small></div>;
  if (error || !data) return <div className="macro-chart-empty">--<small>{error ?? "Range macro risk signals unavailable"}</small></div>;

  return (
    <div className="macro-risk-widget">
      <div className="macro-card-title">
        <div><h3>Biggest Risks &amp; Opportunities to Range Resources</h3><span>{data.allSignalsEvaluated} of 7 tracked drivers evaluated this run · deterministic ranking, AI explains only</span></div>
        <span className="macro-risk-snapshot-date">Macro snapshot: {formatDataDate(data.snapshotAsOf)}</span>
      </div>

      <div className="macro-risk-list">
        {data.signals.length === 0 ? (
          <p className="macro-context-note">No macro driver had enough live data to classify this run.</p>
        ) : (
          data.signals.map((signal, index) => (
            <article key={signal.driver} className={`macro-risk-item ${stateClass(signal.state)}`}>
              <div className="macro-risk-item-head">
                <span className="macro-risk-rank">{index + 1}</span>
                <strong>{signal.label}</strong>
                <span className={`macro-risk-badge ${stateClass(signal.state)}`}>{STATE_LABELS[signal.state]}</span>
              </div>
              <div className="macro-risk-item-metrics">
                {signal.metrics.map((metric) => <span key={metric.label}>{metric.label}: <b>{metric.value}</b></span>)}
              </div>
              <p>{signal.reason}</p>
              <button type="button" className="macro-risk-view" onClick={() => onViewDriver(signal.driver)}>View {signal.label} data →</button>
            </article>
          ))
        )}
      </div>

      <div className="macro-risk-changes">
        <span>WHAT CHANGED</span>
        {data.changes.length > 0 ? (
          <ul>{data.changes.map((change) => <li key={change.driver}>{change.label}: {STATE_LABELS[change.fromState]} → {STATE_LABELS[change.toState]}</li>)}</ul>
        ) : data.hasPriorSnapshot ? (
          <p className="macro-context-note">No driver's classification changed since the last report.</p>
        ) : (
          <p className="macro-context-note">More history is needed to evaluate changes between report periods.</p>
        )}
      </div>

      <div className="macro-ai-summary">
        <span>AI RANGE MACRO SUMMARY</span>
        {(data.aiSummaryStatus === "ready" || data.aiSummaryStatus === "stale") && data.aiSummary ? (
          <>
            <p>{data.aiSummary.summary}</p>
            <small>
              {data.aiSummaryStatus === "stale" ? "Based on a prior data snapshot -- newer data is available and a refreshed summary will follow on the next scheduled run. " : ""}
              Based on Macro snapshot {formatDataDate(data.aiSummary.snapshotAsOf)} · Generated {formatRefreshTimestamp(data.aiSummary.generatedAt)} · {data.aiSummary.aiModel}
            </small>
          </>
        ) : data.aiSummaryStatus === "pending" ? (
          <p className="macro-context-note">AI summary has not been generated for the current data snapshot yet. It updates on the daily Macro schedule, never on page load.</p>
        ) : (
          <p className="macro-context-note">AI summary is currently unavailable.</p>
        )}
      </div>
    </div>
  );
}

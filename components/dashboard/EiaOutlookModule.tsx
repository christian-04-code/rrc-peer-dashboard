"use client";

import { useState } from "react";
import type { MarketFrequency, MarketObservation } from "@/lib/market/types";
import type { MacroSteoResponse } from "@/app/api/macro/steo/route";
import type { SteoSeriesKey } from "@/lib/market/macro-steo-types";
import { filterToForecastHorizon, formatDelta, formatPct } from "@/lib/market/macro-analytics";
import { ChartSeries, HistoricalLineChart } from "@/components/dashboard/MacroVisuals";

export type EiaOutlookMetricOption = {
  key: SteoSeriesKey;
  fallbackLabel: string;
  actual?: { history: MarketObservation[]; label: string; unit: string; frequency: MarketFrequency };
};

function periodLabel(period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) {
    return new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  return period;
}

export function EiaOutlookModule({
  steo,
  loading,
  error,
  metrics,
  forecastStartPeriod
}: {
  steo: MacroSteoResponse | null;
  loading: boolean;
  error: string | null;
  metrics: EiaOutlookMetricOption[];
  /** EIA STEO series carry a long historical tail alongside the true forecast horizon (confirmed live: 2009-present in one array) -- only periods at or after this boundary are ever charted or labeled "(forecast)". Null disables filtering (shows the raw series) when no reliable actual-based boundary is available. */
  forecastStartPeriod: string | null;
}) {
  const available = metrics.filter((option) => steo?.series[option.key]);
  const [selectedKey, setSelectedKey] = useState<SteoSeriesKey | null>(null);
  const active = available.find((option) => option.key === selectedKey) ?? available[0] ?? null;
  const rawSeries = active ? steo?.series[active.key] : undefined;
  const series = rawSeries ? { ...rawSeries, points: filterToForecastHorizon(rawSeries.points, forecastStartPeriod) } : undefined;

  if (loading) return <div className="macro-chart-empty">--<small>Loading EIA Short-Term Energy Outlook…</small></div>;
  if (error || !steo || steo.status !== "ok" || !active || !series || !series.points.length) {
    return <div className="macro-chart-empty">--<small>{error ?? "EIA Short-Term Energy Outlook unavailable"}</small></div>;
  }

  const points = [...series.points].sort((a, b) => a.period.localeCompare(b.period));
  const nearest = points[0];
  const furthest = points[points.length - 1];
  const chartSeries: ChartSeries[] = [];
  if (active.actual) {
    chartSeries.push({ id: "actual", label: active.actual.label, color: "#3db3e3", history: active.actual.history });
  }
  chartSeries.push({ id: "forecast", label: series.label, color: "#e5ad63", history: series.points, forecast: true });

  const revisions = filterToForecastHorizon(steo.revisions[active.key] ?? [], forecastStartPeriod);

  return (
    <div className="eia-outlook">
      <label className="eia-outlook-select">
        <span>EIA STEO metric</span>
        <select value={active.key} onChange={(event) => setSelectedKey(event.target.value as SteoSeriesKey)}>
          {available.map((option) => <option key={option.key} value={option.key}>{steo.series[option.key]?.label ?? option.fallbackLabel}</option>)}
        </select>
      </label>

      <div className="macro-card-title">
        <div><h3>{series.label}</h3><span>EIA Short-Term Energy Outlook · Monthly · {active.actual ? `${active.actual.frequency} actual + ` : ""}forecast</span></div>
      </div>

      <HistoricalLineChart
        ariaLabel={`${series.label}, actual and EIA STEO forecast`}
        unit={series.unit}
        limit={active.actual ? 60 : 30}
        series={chartSeries}
      />

      <div className="macro-inline-stats">
        <div className="macro-stat"><span>Near-term forecast</span><strong>{periodLabel(nearest.period)}</strong><small>{new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(nearest.value)} {series.unit}</small></div>
        <div className="macro-stat"><span>Outlook horizon end</span><strong>{periodLabel(furthest.period)}</strong><small>{new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(furthest.value)} {series.unit}</small></div>
      </div>

      <div className="eia-outlook-revisions">
        <span>FORECAST REVISION</span>
        {revisions.length === 0 ? (
          <p className="macro-context-note">
            Only one EIA STEO snapshot has been captured for this series so far, so there is nothing yet to compare it
            against. Revision tracking will populate automatically as future monthly STEO releases are captured over time.
          </p>
        ) : (
          <div className="eia-outlook-revision-table" role="table" aria-label={`${series.label} forecast revisions`}>
            <div className="eia-outlook-revision-row header" role="row"><span>Period</span><span>Prior snapshot</span><span>Current snapshot</span><span>Change</span></div>
            {revisions.slice(0, 12).map((revision) => (
              <div className="eia-outlook-revision-row" role="row" key={revision.period}>
                <span>{periodLabel(revision.period)}</span>
                <span>{new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(revision.previousValue)} <small>({revision.previousSnapshotMonth})</small></span>
                <span>{new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(revision.currentValue)} <small>({revision.currentSnapshotMonth})</small></span>
                <span className={revision.delta === 0 ? "" : revision.delta > 0 ? "positive" : "negative"}>{formatDelta(revision.delta, series.unit)} {revision.deltaPct !== null ? `(${formatPct(revision.deltaPct)})` : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

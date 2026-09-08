import type { WeeklyEvidenceItem, WeeklyReportPayload } from "@/lib/reports/weekly-report-types";
import type { ChartBar, ChartPlan } from "@/lib/reports/render/render-model";

/**
 * Phase 7D deterministic chart construction. Every bar's value/displayValue
 * traces directly back to a WeeklyEvidenceItem's own currentValue/
 * comparisons -- nothing here calculates, estimates, or invents a number.
 *
 * Chart shape is deliberately NOT a continuous multi-point trend line: a
 * WeeklyEvidenceItem carries only its own currentValue plus a small set of
 * named comparison points (WoW/YoY/vs5yrAvg/MoM/QoQ/steoVintage -- see
 * comparisons.ts), never a full historical series, because the frozen
 * WeeklyReportPayload this renderer consumes never retains one (Phase 7B's
 * evidence items are a snapshot, not a time series store). A bar chart of
 * "current vs. each named comparison point" is the honest, fully-supported
 * chart shape for that data; drawing a fabricated continuous line through
 * only 2-3 real points would imply a granularity the underlying data does
 * not have. See docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md's Phase 7D
 * section for the full reasoning and the future path (persisting real
 * historical series) that would be needed before a true trend line is honest.
 */

const COMPARISON_SHORT_LABEL: Record<string, string> = {
  WoW: "1wk ago",
  MoM: "1mo ago",
  QoQ: "prior qtr",
  YoY: "1yr ago",
  vs5yrAvg: "5yr avg",
  steoVintage: "prior vintage",
  priorQuarterActuals: "1yr ago"
};

/** Current value + up to 3 of the item's own available (non-"unavailable") comparison points, each labeled by what it actually is. Null if the item has no real currentValue or no available comparison at all (nothing useful to chart). */
export function buildComparisonBarChart(item: WeeklyEvidenceItem): ChartPlan | null {
  if (item.currentValue === null) return null;
  const bars: ChartBar[] = [{ label: "Current", value: item.currentValue, displayValue: item.displayValue }];
  for (const cmp of item.comparisons) {
    if (bars.length >= 4) break;
    if (cmp.previousValue === null || cmp.direction === "unavailable") continue;
    const label = COMPARISON_SHORT_LABEL[cmp.period] ?? cmp.period;
    bars.push({ label, value: cmp.previousValue, displayValue: formatWithUnit(cmp.previousValue, item.unit) });
  }
  if (bars.length < 2) return null;
  return {
    id: `chart:${item.evidenceId}`,
    kind: "comparisonBar",
    title: item.label,
    unit: item.unit,
    bars,
    caption: captionFor(item),
    sourceLine: item.sourceIds.join(", ")
  };
}

function formatWithUnit(value: number, unit: string | null): string {
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.abs(value) < 10 ? 2 : 0 }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function captionFor(item: WeeklyEvidenceItem): string {
  const available = item.comparisons.find((c) => c.direction !== "unavailable" && c.deltaPct !== null);
  if (!available || available.deltaPct === null) return `${item.label}: ${item.displayValue}.`;
  const verb = available.direction === "up" ? "up" : available.direction === "down" ? "down" : "flat";
  const pct = Math.abs(available.deltaPct).toFixed(1);
  return verb === "flat" ? `${item.label}: ${item.displayValue}, unchanged ${available.basisDescription ?? ""}.`.trim() : `${item.label}: ${item.displayValue}, ${verb} ${pct}% ${available.basisDescription ?? ""}.`.trim();
}

/** Bars = one per item's own currentValue -- for a small group of same-unit items observed at the same time (e.g. national + Marcellus + Utica rig counts), never a mix of incompatible units. */
export function buildMultiItemBarChart(id: string, title: string, items: WeeklyEvidenceItem[]): ChartPlan | null {
  const withValue = items.filter((item): item is WeeklyEvidenceItem & { currentValue: number } => item.currentValue !== null);
  if (withValue.length < 2) return null;
  const unit = withValue[0].unit;
  const bars: ChartBar[] = withValue.map((item) => ({ label: item.label, value: item.currentValue, displayValue: item.displayValue }));
  return {
    id,
    kind: "multiItemBar",
    title,
    unit,
    bars,
    caption: withValue.map((item) => `${item.label}: ${item.displayValue}`).join("; ") + ".",
    sourceLine: [...new Set(withValue.flatMap((item) => item.sourceIds))].join(", ")
  };
}

/** Range's own current value for one metric + each peer's current value for that metric, from the SAME frozen snapshot -- never a live re-fetch. rangeMetricKey/peerMetricKey pairing must be supplied by the caller (see table-builder.ts's RANGE_VS_PEERS_METRICS -- the one place this mapping is defined) since the two categories' metricKeys were never designed to align. */
export function buildPeerBarChart(payload: WeeklyReportPayload, rangeMetricKey: string, peerMetricKey: string, label: string): ChartPlan | null {
  const rangeItem = (payload.modules.range_company ?? []).find((item) => item.metricKey === rangeMetricKey);
  if (!rangeItem || rangeItem.currentValue === null) return null;
  const peerItems = (payload.modules.peers ?? []).filter((item) => item.metricKey === peerMetricKey && item.currentValue !== null);
  if (peerItems.length === 0) return null;

  const bars: ChartBar[] = [
    { label: "RRC", value: rangeItem.currentValue, displayValue: rangeItem.displayValue },
    ...[...peerItems]
      .sort((a, b) => String(a.metadata.ticker).localeCompare(String(b.metadata.ticker)))
      .map((item) => ({ label: String(item.metadata.ticker), value: item.currentValue as number, displayValue: item.displayValue }))
  ];

  return {
    id: `chart:peer_bar:${rangeMetricKey}`,
    kind: "peerBar",
    title: `RRC vs. Peers: ${label}`,
    unit: rangeItem.unit,
    bars,
    caption: `RRC ${label.toLowerCase()} of ${rangeItem.displayValue} shown against ${peerItems.length} peer${peerItems.length === 1 ? "" : "s"} for the same period.`,
    sourceLine: "Peer quarterly financials"
  };
}

/** Range's own reported actual for a metric vs. Range's own default-scenario forecast for a related forward metric -- both from this snapshot's own range_company/forecast_scenarios modules, never a live forecast re-run. */
export function buildActualVsForecastBarChart(payload: WeeklyReportPayload, rangeMetricKey: string, forecastMetricKey: string, label: string): ChartPlan | null {
  const actual = (payload.modules.range_company ?? []).find((item) => item.metricKey === rangeMetricKey);
  const forecast = (payload.modules.forecast_scenarios ?? []).find((item) => item.metricKey === forecastMetricKey);
  if (!actual || actual.currentValue === null || !forecast || forecast.currentValue === null) return null;
  return {
    id: `chart:actual_vs_forecast:${rangeMetricKey}`,
    kind: "actualVsForecastBar",
    title: `RRC Actual vs. Default-Scenario Forecast: ${label}`,
    unit: actual.unit,
    bars: [
      { label: `Actual (${actual.period ?? "latest"})`, value: actual.currentValue, displayValue: actual.displayValue },
      { label: `Forecast (${forecast.period ?? "forward"})`, value: forecast.currentValue, displayValue: forecast.displayValue }
    ],
    caption: `RRC's default-scenario ${label.toLowerCase()} forecast of ${forecast.displayValue} (${forecast.period ?? "forward period"}) compares against the latest actual of ${actual.displayValue} (${actual.period ?? "latest period"}).`,
    sourceLine: "RRC quarterly financials; RRC default-scenario forecast model"
  };
}

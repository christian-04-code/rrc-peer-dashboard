import type { EvidenceModuleKey, WeeklyEvidenceItem, WeeklyReportPayload } from "@/lib/reports/weekly-report-types";
import { rankEvidenceByMateriality } from "@/lib/reports/materiality";
import type { ContentBudget } from "@/lib/reports/render/content-budget";
import { buildActualVsForecastBarChart, buildComparisonBarChart, buildMultiItemBarChart, buildPeerBarChart } from "@/lib/reports/render/chart-selection";
import { buildNewsTable, buildPeerComparisonTable } from "@/lib/reports/render/table-builder";
import { composeEvidenceCommentary, composeMultiItemCommentary, composeRangeImplication } from "@/lib/reports/render/commentary";
import type { EvidenceSection, TablePlan } from "@/lib/reports/render/render-model";

/**
 * Phase 7D evidence-section candidate generation + deterministic,
 * materiality-ranked selection (pages 2-4's analytical core). Per Section 4
 * of the brief -- "do not rigidly force every subsection every week" -- this
 * file builds ONE candidate per plausible subject, then keeps only the
 * budget's top N by materiality; a quiet week for a given subject simply
 * doesn't make the cut, it is never force-included nor zero-filled.
 *
 * Ranking reuses materiality.ts's rankEvidenceByMateriality twice: once
 * per-candidate (to find that candidate's own most-material representative
 * item, for multi-item candidates like Rig Activity) and once across
 * candidates (to rank the candidates against each other by their
 * representative item's materiality) -- the same deterministic comparator,
 * not a second invented scoring rule.
 */

const SINGLE_ITEM_CATEGORIES: { category: EvidenceModuleKey; heading: string }[] = [
  { category: "gas_pricing", heading: "Natural Gas Pricing" },
  { category: "storage", heading: "Storage" },
  { category: "us_gas_supply", heading: "U.S. Gas Supply" },
  { category: "appalachia_supply", heading: "Appalachia Supply" },
  { category: "lng_demand", heading: "LNG Exports" },
  { category: "power_data_center_demand", heading: "Power / Data Center Demand" },
  { category: "industrial_demand", heading: "Industrial Demand" }
];

const RANGE_VS_PEERS_CHART_METRIC = { rangeMetricKey: "revenue", peerMetricKey: "revenue", label: "Revenue" };
const ACTUAL_VS_FORECAST_METRICS: { rangeMetricKey: string; forecastMetricKey: string; label: string }[] = [
  { rangeMetricKey: "revenue", forecastMetricKey: "default_scenario_revenue", label: "Revenue" },
  { rangeMetricKey: "free_cash_flow", forecastMetricKey: "default_scenario_fcf", label: "Free Cash Flow" }
];

function steoOutlookTable(items: WeeklyEvidenceItem[], maxRows: number): TablePlan | null {
  if (items.length === 0) return null;
  const ranked = rankEvidenceByMateriality(items).slice(0, maxRows);
  return {
    id: "steo_outlook",
    title: "Tracked STEO Series",
    columns: [
      { key: "series", label: "Series", align: "left" },
      { key: "value", label: "Near-Term Value", align: "right" },
      { key: "vintage", label: "vs. Prior Vintage", align: "right" }
    ],
    rows: ranked.map((item) => {
      const vintage = item.comparisons.find((c) => c.period === "steoVintage" && c.direction !== "unavailable" && c.deltaPct !== null);
      return {
        series: item.label,
        value: item.displayValue,
        vintage: vintage && vintage.deltaPct !== null ? `${vintage.direction === "up" ? "↑" : vintage.direction === "down" ? "↓" : "→"} ${Math.abs(vintage.deltaPct).toFixed(1)}%` : "--"
      };
    }),
    sourceLine: null,
    truncatedCount: Math.max(0, items.length - maxRows)
  };
}

type Candidate = {
  key: string;
  heading: string;
  representative: WeeklyEvidenceItem;
  build: () => EvidenceSection;
};

export function buildEvidenceSections(payload: WeeklyReportPayload, budget: ContentBudget): { sections: EvidenceSection[]; omittedLabels: string[] } {
  const candidates: Candidate[] = [];

  for (const { category, heading } of SINGLE_ITEM_CATEGORIES) {
    const items = payload.modules[category] ?? [];
    if (items.length === 0) continue;
    const item = rankEvidenceByMateriality(items)[0];
    candidates.push({
      key: category,
      heading,
      representative: item,
      build: () => ({
        id: `section:${category}`,
        heading,
        chart: buildComparisonBarChart(item),
        table: null,
        commentary: composeEvidenceCommentary(item, budget.maxCommentarySentences),
        rangeImplication: composeRangeImplication(item)
      })
    });
  }

  const rigsItems = payload.modules.rigs ?? [];
  if (rigsItems.length > 0) {
    const representative = rankEvidenceByMateriality(rigsItems)[0];
    // The national U.S. count and the individual Appalachian basin counts are
    // both denominated in "rigs" but sit on entirely different scales (hundreds
    // vs. tens) -- charting them together would dwarf the two basin bars Range
    // actually cares about. The basins are genuinely comparable to each other,
    // so only those get the bar chart; the national count stays a plain sentence.
    const basinItems = rigsItems.filter((i) => i.metricKey.startsWith("basin_"));
    const nationalItems = rigsItems.filter((i) => !i.metricKey.startsWith("basin_"));
    candidates.push({
      key: "rigs",
      heading: "Rig Activity",
      representative,
      build: () => ({
        id: "section:rigs",
        heading: "Rig Activity",
        chart: basinItems.length > 0 ? buildMultiItemBarChart("chart:rigs", "Appalachian Rig Activity", basinItems) : null,
        table: null,
        commentary: composeMultiItemCommentary([...nationalItems, ...basinItems], budget.maxCommentarySentences),
        rangeImplication: composeRangeImplication(representative)
      })
    });
  }

  const steoItems = payload.modules.steo_outlook ?? [];
  if (steoItems.length > 0) {
    const representative = rankEvidenceByMateriality(steoItems)[0];
    candidates.push({
      key: "steo_outlook",
      heading: "EIA Outlook (STEO)",
      representative,
      build: () => ({
        id: "section:steo_outlook",
        heading: "EIA Outlook (STEO)",
        chart: null,
        table: steoOutlookTable(steoItems, budget.maxRisksOpportunitiesRows),
        commentary: [`EIA's Short-Term Energy Outlook covers ${steoItems.length} tracked series this week; see the table for near-term values and revisions vs. the prior forecast vintage where available.`],
        rangeImplication: null
      })
    });
  }

  const rangeItems = payload.modules.range_company ?? [];
  const rangeMetricItems = rangeItems.filter((item) => !item.metricKey.startsWith("guidance:"));
  if (rangeMetricItems.length > 0) {
    const representative = rankEvidenceByMateriality(rangeMetricItems)[0];
    candidates.push({
      key: "range_company",
      heading: "Range Resources Company Metrics",
      representative,
      build: () => ({
        id: "section:range_company",
        heading: "Range Resources Company Metrics",
        chart: buildComparisonBarChart(representative),
        table: null,
        commentary: composeEvidenceCommentary(representative, budget.maxCommentarySentences),
        rangeImplication: null
      })
    });
  }

  const peerItems = payload.modules.peers ?? [];
  if (peerItems.length > 0) {
    const representative = rankEvidenceByMateriality(peerItems)[0];
    candidates.push({
      key: "peers",
      heading: "Peer Comparison",
      representative,
      build: () => ({
        id: "section:peers",
        heading: "Peer Comparison",
        chart: buildPeerBarChart(payload, RANGE_VS_PEERS_CHART_METRIC.rangeMetricKey, RANGE_VS_PEERS_CHART_METRIC.peerMetricKey, RANGE_VS_PEERS_CHART_METRIC.label),
        table: buildPeerComparisonTable(payload, budget),
        commentary: [`Range is compared against ${new Set(peerItems.map((i) => i.metadata.ticker)).size} Appalachian/gas-weighted peers on headline quarterly metrics.`],
        rangeImplication: null
      })
    });
  }

  const forecastItems = payload.modules.forecast_scenarios ?? [];
  if (forecastItems.length > 0) {
    const representative = rankEvidenceByMateriality(forecastItems)[0];
    const pairing = ACTUAL_VS_FORECAST_METRICS.find((spec) => forecastItems.some((item) => item.metricKey === spec.forecastMetricKey)) ?? ACTUAL_VS_FORECAST_METRICS[0];
    candidates.push({
      key: "forecast_scenarios",
      heading: "Range vs. Default-Scenario Forecast",
      representative,
      build: () => ({
        id: "section:forecast_scenarios",
        heading: "Range vs. Default-Scenario Forecast",
        chart: buildActualVsForecastBarChart(payload, pairing.rangeMetricKey, pairing.forecastMetricKey, pairing.label),
        table: null,
        commentary: [`RRC's parameterless default-scenario forecast is shown against the latest reported actual for context; this is not a persisted forecast-revision comparison (no prior scenario vintage is stored yet).`],
        rangeImplication: null
      })
    });
  }

  const newsItems = payload.modules.news ?? [];
  if (newsItems.length > 0) {
    const representative = rankEvidenceByMateriality(newsItems)[0];
    candidates.push({
      key: "news",
      heading: "Material News",
      representative,
      build: () => ({
        id: "section:news",
        heading: "Material News",
        chart: null,
        table: buildNewsTable(payload, budget),
        commentary: [`${newsItems.length} analyzed News item${newsItems.length === 1 ? "" : "s"} were retained as material for Range this reporting window.`],
        rangeImplication: composeRangeImplication(representative)
      })
    });
  }

  const rankedRepresentatives = rankEvidenceByMateriality(candidates.map((c) => c.representative));
  const orderedCandidates = rankedRepresentatives
    .map((representative) => candidates.find((c) => c.representative.evidenceId === representative.evidenceId))
    .filter((c): c is Candidate => c !== undefined);

  const selected = orderedCandidates.slice(0, budget.maxEvidenceSections);
  const omitted = orderedCandidates.slice(budget.maxEvidenceSections);

  return {
    sections: selected.map((c) => c.build()).filter((section) => section.chart !== null || section.table !== null || section.commentary.length > 0),
    omittedLabels: omitted.map((c) => c.heading)
  };
}

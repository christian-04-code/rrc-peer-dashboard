import type { EvidenceModuleKey, WeeklyEvidenceItem, WeeklyReportPayload } from "@/lib/reports/weekly-report-types";
import { rankEvidenceByMateriality } from "@/lib/reports/materiality";
import type { ContentBudget } from "@/lib/reports/render/content-budget";
import { buildActualVsForecastBarChart, buildComparisonBarChart, buildMultiItemBarChart, buildPeerBarChart } from "@/lib/reports/render/chart-selection";
import { buildGuidanceWatchTable, buildKeyMetricsToWatchTable, buildNewsTable, buildPeerComparisonTable, buildValuationComparisonTable } from "@/lib/reports/render/table-builder";
import { composeEvidenceCommentary, composeMultiItemCommentary, composeRangeImplication } from "@/lib/reports/render/commentary";
import { formatSignedPct } from "@/lib/reports/render/format";
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

/**
 * The single most material article's own persisted excerpt (a reported
 * fact, from News's existing AI analysis -- never re-summarized here),
 * plus a plain count of the rest. Replaces a prior generic
 * "N items were retained" sentence that carried no actual news content.
 */
function newsFactualCommentary(items: WeeklyEvidenceItem[], representative: WeeklyEvidenceItem): string[] {
  const excerpt = typeof representative.metadata.excerpt === "string" ? representative.metadata.excerpt.trim() : "";
  const publisher = typeof representative.metadata.publisher === "string" ? representative.metadata.publisher : null;
  const sentences: string[] = [];
  if (excerpt) {
    sentences.push(publisher ? `${publisher}: ${excerpt}` : excerpt);
  }
  const remaining = items.length - 1;
  if (remaining > 0) {
    sentences.push(`${remaining} additional analyzed News item${remaining === 1 ? "" : "s"} ${remaining === 1 ? "was" : "were"} also retained as material this reporting window; see the table below.`);
  } else if (sentences.length === 0) {
    sentences.push(`${items.length} analyzed News item${items.length === 1 ? "" : "s"} were retained as material for Range this reporting window.`);
  }
  return sentences;
}

/**
 * Splits the one "news" evidence pool into three mutually-exclusive
 * partitions by News's own existing category classification (never a new
 * relevance/entity-matching rule) -- added for the IR-report enhancement's
 * "Company-Specific News & Implications" and "Peer Developments That Matter
 * to Range" sections (2026-09-08). An article tagged both "range" and
 * "peers" counts as range-specific (Range's own news takes priority over a
 * peer mention within it). Every article appears in exactly one section, so
 * nothing is ever shown twice.
 */
function partitionNewsItems(items: WeeklyEvidenceItem[]): { rangeNews: WeeklyEvidenceItem[]; peerNews: WeeklyEvidenceItem[]; otherNews: WeeklyEvidenceItem[] } {
  const categoriesOf = (item: WeeklyEvidenceItem): string[] => (Array.isArray(item.metadata.category) ? item.metadata.category : []);
  const rangeNews = items.filter((item) => categoriesOf(item).includes("range"));
  const peerNews = items.filter((item) => !categoriesOf(item).includes("range") && categoriesOf(item).includes("peers"));
  const otherNews = items.filter((item) => !categoriesOf(item).includes("range") && !categoriesOf(item).includes("peers"));
  return { rangeNews, peerNews, otherNews };
}

function newsSectionCandidate(key: string, heading: string, items: WeeklyEvidenceItem[], budget: ContentBudget): Candidate | null {
  if (items.length === 0) return null;
  const representative = rankEvidenceByMateriality(items)[0];
  return {
    key,
    heading,
    representative,
    build: () => ({
      id: `section:${key}`,
      heading,
      chart: null,
      table: buildNewsTable(items, budget, `${key}_table`, heading),
      commentary: newsFactualCommentary(items, representative),
      rangeImplication: composeRangeImplication(representative)
    })
  };
}

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
        vintage: vintage && vintage.deltaPct !== null ? formatSignedPct(vintage.deltaPct, vintage.direction as Exclude<typeof vintage.direction, "unavailable">) : "--"
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

  // Partitioned by News's own existing category tags -- see
  // partitionNewsItems's header. Each of the three is its own independent,
  // conditional candidate: a quiet week with no Range-specific news simply
  // omits that section without affecting the other two, and no article is
  // ever shown in more than one of them.
  const { rangeNews, peerNews, otherNews } = partitionNewsItems(payload.modules.news ?? []);
  const newsCandidates = [
    newsSectionCandidate("company_news", "Company-Specific News & Implications", rangeNews, budget),
    newsSectionCandidate("peer_news", "Peer Developments That Matter to Range", peerNews, budget),
    newsSectionCandidate("news", "Material News", otherNews, budget)
  ].filter((c): c is Candidate => c !== null);
  candidates.push(...newsCandidates);

  const valuationItems = payload.modules.valuation ?? [];
  if (valuationItems.length > 0) {
    const rangeValuationItems = valuationItems.filter((item) => item.metadata.isRange === true && item.currentValue !== null);
    if (rangeValuationItems.length > 0) {
      const representative = rankEvidenceByMateriality(rangeValuationItems)[0];
      candidates.push({
        key: "valuation",
        heading: "Valuation & Share-Price Context",
        representative,
        build: () => ({
          id: "section:valuation",
          heading: "Valuation & Share-Price Context",
          chart: null,
          table: buildValuationComparisonTable(payload, budget),
          commentary: composeEvidenceCommentary(representative, budget.maxCommentarySentences),
          rangeImplication: null
        })
      });
    }
  }

  // Guidance Watch: reuses the same range_company guidance items already
  // collected by range-company-adapter.ts (getCompanyGuidanceRecords) --
  // no new data source. Consensus is deliberately never included (see
  // buildGuidanceWatchTable's own header) -- this project has no analyst-
  // consensus data source, so the title/content never implies one exists.
  const guidanceItems = rangeItems.filter((item) => item.metricKey.startsWith("guidance:"));
  if (guidanceItems.length > 0) {
    const representative = rankEvidenceByMateriality(guidanceItems)[0];
    candidates.push({
      key: "guidance_watch",
      heading: "Guidance Watch",
      representative,
      build: () => ({
        id: "section:guidance_watch",
        heading: "Guidance Watch",
        chart: null,
        table: buildGuidanceWatchTable(payload, budget),
        commentary: [],
        rangeImplication: null
      })
    });
  }

  // Key Metrics to Watch Next Week: a distinct, forward-looking view over
  // the same near-weekly-cadence evidence already collected above (never a
  // restatement of the entire Macro dashboard -- limited to categories with
  // a real next-week observation, see NEXT_WEEK_WATCH_CATEGORIES).
  const keyMetricsTable = buildKeyMetricsToWatchTable(payload, budget);
  if (keyMetricsTable && keyMetricsTable.rows.length > 0) {
    const nextWeekCategories: EvidenceModuleKey[] = ["storage", "gas_pricing", "us_gas_supply", "appalachia_supply", "lng_demand", "power_data_center_demand", "industrial_demand", "rigs"];
    const nextWeekItems = nextWeekCategories.flatMap((category) => payload.modules[category] ?? []);
    const representative = rankEvidenceByMateriality(nextWeekItems)[0];
    candidates.push({
      key: "key_metrics_to_watch",
      heading: "Key Metrics to Watch Next Week",
      representative,
      build: () => ({
        id: "section:key_metrics_to_watch",
        heading: "Key Metrics to Watch Next Week",
        chart: null,
        table: keyMetricsTable,
        commentary: [],
        rangeImplication: null
      })
    });
  }

  // Two DIFFERENT candidates can legitimately share the exact same
  // representative evidenceId -- e.g. "Storage" and "Key Metrics to Watch
  // Next Week" both draw from payload.modules.storage, so storage's own
  // top item can be the single highest-materiality pick for both. Matching
  // back by evidenceId (or by object reference to the original, shared
  // array element) would make BOTH candidates resolve to whichever one
  // .find() hits first, silently dropping the other. Ranking a shallow
  // clone per candidate (a distinct object even when content is identical)
  // and mapping back by clone identity keeps every candidate distinguishable
  // without duplicating rankEvidenceByMateriality's own scoring rule.
  const representativeClones = candidates.map((c) => ({ ...c.representative }));
  const candidateByClone = new Map(representativeClones.map((clone, index) => [clone, candidates[index]]));
  const rankedRepresentatives = rankEvidenceByMateriality(representativeClones);
  const orderedCandidates = rankedRepresentatives.map((clone) => candidateByClone.get(clone)!).filter((c): c is Candidate => c !== undefined);

  const selected = orderedCandidates.slice(0, budget.maxEvidenceSections);
  const omitted = orderedCandidates.slice(budget.maxEvidenceSections);

  return {
    sections: selected.map((c) => c.build()).filter((section) => section.chart !== null || section.table !== null || section.commentary.length > 0),
    omittedLabels: omitted.map((c) => c.heading)
  };
}

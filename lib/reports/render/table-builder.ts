import type { ComparisonResult, WeeklyEvidenceItem, WeeklyReportPayload } from "@/lib/reports/weekly-report-types";
import { rankEvidenceByMateriality } from "@/lib/reports/materiality";
import type { ContentBudget } from "@/lib/reports/render/content-budget";
import type { TablePlan, TableRow } from "@/lib/reports/render/render-model";

/**
 * Phase 7D deterministic table construction -- every function here is a
 * pure transformation of an already-frozen WeeklyReportPayload plus a
 * ContentBudget; none fetches, none calls AI, none invents a row. A row is
 * omitted (never zero-filled) whenever its underlying item/value is absent,
 * per the project's long-standing "never fabricate a missing value" rule.
 */

const COMPARISON_PERIOD_SHORT_LABEL: Record<ComparisonResult["period"], string> = {
  WoW: "WoW",
  MoM: "MoM",
  QoQ: "QoQ",
  YoY: "YoY",
  vs5yrAvg: "vs 5-yr avg",
  percentileRange: "percentile",
  steoVintage: "vs prior vintage",
  priorQuarterActuals: "YoY",
  peerChange: "vs peers",
  forecastRevision: "revision"
};

/** The first available (non-"unavailable") comparison on the item, formatted as a compact "+2.1% WoW" style annotation -- null if the item carries no available comparison at all. */
function firstComparisonAnnotation(item: WeeklyEvidenceItem): string | null {
  const cmp = item.comparisons.find((c) => c.direction !== "unavailable" && c.deltaPct !== null);
  if (!cmp || cmp.deltaPct === null) return null;
  const arrow = cmp.direction === "up" ? "↑" : cmp.direction === "down" ? "↓" : "→";
  return `${arrow} ${Math.abs(cmp.deltaPct).toFixed(1)}% ${COMPARISON_PERIOD_SHORT_LABEL[cmp.period]}`;
}

function truncate(rows: TableRow[], max: number): { rows: TableRow[]; truncatedCount: number } {
  if (rows.length <= max) return { rows, truncatedCount: 0 };
  return { rows: rows.slice(0, max), truncatedCount: rows.length - max };
}

/** One representative (highest-materiality) item per distinct category, ranked against each other -- diversity-aware so the at-a-glance strip doesn't fill up with e.g. six gas_pricing rows. */
export function buildAtAGlanceTable(payload: WeeklyReportPayload, budget: ContentBudget): TablePlan {
  const backdropCategories = ["gas_pricing", "storage", "us_gas_supply", "appalachia_supply", "lng_demand", "power_data_center_demand", "industrial_demand", "rigs", "range_company"] as const;
  const representatives: WeeklyEvidenceItem[] = [];
  for (const category of backdropCategories) {
    const items = payload.modules[category] ?? [];
    if (items.length === 0) continue;
    representatives.push(rankEvidenceByMateriality(items)[0]);
  }
  const ranked = rankEvidenceByMateriality(representatives);
  const { rows: selected, truncatedCount } = truncate(
    ranked.map((item) => {
      const annotation = firstComparisonAnnotation(item);
      return { metric: item.label, value: annotation ? `${item.displayValue} (${annotation})` : item.displayValue };
    }),
    budget.maxAtAGlanceMetrics
  );
  return {
    id: "at_a_glance",
    title: "At a Glance",
    columns: [
      { key: "metric", label: "Metric", align: "left" },
      { key: "value", label: "Value", align: "right" }
    ],
    rows: selected,
    sourceLine: null,
    truncatedCount
  };
}

/** Explicit, documented metricKey pairing between range_company and peers -- their metricKeys were never designed to align 1:1 (see peers-adapter.ts/range-company-adapter.ts), so this mapping is a deliberate decision, not an inferred guess. */
const RANGE_VS_PEERS_METRICS: { rangeMetricKey: string; peerMetricKey: string; label: string }[] = [
  { rangeMetricKey: "revenue", peerMetricKey: "revenue", label: "Revenue" },
  { rangeMetricKey: "adjusted_ebitdax", peerMetricKey: "ebitdax", label: "Adj. EBITDAX" },
  { rangeMetricKey: "free_cash_flow", peerMetricKey: "fcf", label: "FCF" }
];

/** Range + up to budget.maxPeerCompanies peer tickers (alphabetical for determinism), across the metrics in RANGE_VS_PEERS_METRICS that this snapshot actually has a real value for on both sides. Omits a metric column entirely rather than filling it with "--" for every row if Range's own side is missing. */
export function buildPeerComparisonTable(payload: WeeklyReportPayload, budget: ContentBudget): TablePlan | null {
  const rangeItems = payload.modules.range_company ?? [];
  const peerItems = payload.modules.peers ?? [];
  if (peerItems.length === 0) return null;

  const rangeByMetric = new Map(rangeItems.map((item) => [item.metricKey, item]));
  const metrics = RANGE_VS_PEERS_METRICS.filter((spec) => rangeByMetric.has(spec.rangeMetricKey));
  if (metrics.length === 0) return null;

  const tickers = [...new Set(peerItems.map((item) => (typeof item.metadata.ticker === "string" ? item.metadata.ticker : null)).filter((t): t is string => t !== null))].sort();
  const { rows: selectedTickers, truncatedCount } = truncate(
    tickers.map((t) => ({ ticker: t })),
    budget.maxPeerCompanies
  );

  const peerByTickerAndMetric = new Map(peerItems.map((item) => [`${item.metadata.ticker}:${item.metricKey}`, item]));

  const rows: TableRow[] = [
    Object.fromEntries([["company", "RRC"], ...metrics.map((spec) => [spec.rangeMetricKey, rangeByMetric.get(spec.rangeMetricKey)!.displayValue])])
  ];
  for (const { ticker } of selectedTickers) {
    rows.push(
      Object.fromEntries([
        ["company", ticker],
        ...metrics.map((spec) => {
          const item = peerByTickerAndMetric.get(`${ticker}:${spec.peerMetricKey}`);
          return [spec.rangeMetricKey, item ? item.displayValue : "--"];
        })
      ])
    );
  }

  return {
    id: "peer_comparison",
    title: "Range vs. Peers",
    columns: [{ key: "company", label: "Company", align: "left" }, ...metrics.map((spec) => ({ key: spec.rangeMetricKey, label: spec.label, align: "right" as const }))],
    rows,
    sourceLine: `${rangeItems[0]?.metadata.source ?? "RRC quarterly financials"}; peer quarterly financials`,
    truncatedCount
  };
}

export function buildRisksOpportunitiesTable(payload: WeeklyReportPayload, budget: ContentBudget): TablePlan | null {
  const items = payload.modules.deterministic_risk_opportunity ?? [];
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => (a.materialityInputs.riskSeverityRank ?? 99) - (b.materialityInputs.riskSeverityRank ?? 99));
  const { rows, truncatedCount } = truncate(
    sorted.map((item) => ({
      signal: item.label,
      state: item.displayValue,
      rank: item.materialityInputs.riskSeverityRank !== null ? String(item.materialityInputs.riskSeverityRank) : "--"
    })),
    budget.maxRisksOpportunitiesRows
  );
  return {
    id: "risks_opportunities",
    title: "Key Risks & Opportunities (Deterministic Risk Engine)",
    columns: [
      { key: "signal", label: "Signal", align: "left" },
      { key: "state", label: "State", align: "left" },
      { key: "rank", label: "Rank", align: "right" }
    ],
    rows,
    sourceLine: null,
    truncatedCount
  };
}

export function buildNewsTable(payload: WeeklyReportPayload, budget: ContentBudget): TablePlan | null {
  const items = payload.modules.news ?? [];
  if (items.length === 0) return null;
  const { rows, truncatedCount } = truncate(
    items.map((item) => ({
      headline: item.label,
      date: item.asOfDate ?? "--",
      rangeImpact: item.displayValue
    })),
    budget.maxNewsRows
  );
  return {
    id: "material_news",
    title: "Material News",
    columns: [
      { key: "headline", label: "Headline", align: "left" },
      { key: "date", label: "Date", align: "left" },
      { key: "rangeImpact", label: "Range Impact", align: "left" }
    ],
    rows,
    sourceLine: null,
    truncatedCount
  };
}

export function buildSourcesFreshnessTable(payload: WeeklyReportPayload, budget: ContentBudget): TablePlan {
  const { rows, truncatedCount } = truncate(
    payload.sourceManifest.generatedFrom.map((entry) => ({
      source: entry.label,
      period: entry.period ?? "--",
      freshness: entry.freshness
    })),
    budget.maxSourceRows
  );
  return {
    id: "sources_freshness",
    title: "Sources & Data Freshness",
    columns: [
      { key: "source", label: "Source", align: "left" },
      { key: "period", label: "Period", align: "left" },
      { key: "freshness", label: "Freshness", align: "left" }
    ],
    rows,
    sourceLine: `Data cutoff: ${payload.dataCutoffAt}`,
    truncatedCount
  };
}

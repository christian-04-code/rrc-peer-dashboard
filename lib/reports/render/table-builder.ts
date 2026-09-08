import type { ComparisonResult, EvidenceModuleKey, WeeklyEvidenceItem, WeeklyReportPayload } from "@/lib/reports/weekly-report-types";
import { rankEvidenceByMateriality } from "@/lib/reports/materiality";
import type { ContentBudget } from "@/lib/reports/render/content-budget";
import type { TablePlan, TableRow } from "@/lib/reports/render/render-model";
import { formatSignedPct } from "@/lib/reports/render/format";
import { CATEGORY_WHY_IT_MATTERS } from "@/lib/reports/render/commentary";

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
  return `${formatSignedPct(cmp.deltaPct, cmp.direction as Exclude<typeof cmp.direction, "unavailable">)} ${COMPARISON_PERIOD_SHORT_LABEL[cmp.period]}`;
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

  // Built from the ACTUAL per-column sources of the metrics/companies shown in
  // this specific table, deduped -- not assumed from one representative item.
  // A real Preview PDF showed this line read "codex (actual); peer quarterly
  // financials" for every column regardless of what each column's own metric
  // was actually sourced from (the prior code only ever read rangeItems[0]'s
  // metadata, i.e. whichever range_company item happened to be first).
  const shownSourceLabels = new Set<string>();
  for (const spec of metrics) {
    const rangeSource = rangeByMetric.get(spec.rangeMetricKey)?.metadata.source;
    if (typeof rangeSource === "string") shownSourceLabels.add(rangeSource);
    for (const { ticker } of selectedTickers) {
      const peerSource = peerByTickerAndMetric.get(`${ticker}:${spec.peerMetricKey}`)?.metadata.source;
      if (typeof peerSource === "string") shownSourceLabels.add(peerSource);
    }
  }

  return {
    id: "peer_comparison",
    title: "Range vs. Peers",
    columns: [{ key: "company", label: "Company", align: "left" }, ...metrics.map((spec) => ({ key: spec.rangeMetricKey, label: spec.label, align: "right" as const }))],
    rows,
    sourceLine: shownSourceLabels.size > 0 ? [...shownSourceLabels].join("; ") : "RRC & peer quarterly financials",
    truncatedCount
  };
}

const VALUATION_METRIC_COLUMNS: { metricKey: string; label: string }[] = [
  { metricKey: "market_cap", label: "Market Cap" },
  { metricKey: "enterprise_value", label: "EV" },
  { metricKey: "ev_to_ltm_ebitdax", label: "EV/LTM EBITDAX" },
  { metricKey: "ltm_fcf_yield", label: "LTM FCF Yield" }
];

/**
 * Valuation & Share-Price Context (added for the IR-report enhancement,
 * 2026-09-08). Unlike buildPeerComparisonTable, RRC and peers share one
 * "valuation" category (see valuation-adapter.ts), distinguished by
 * `metadata.isRange`/`metadata.ticker` -- not a category split. Returns null
 * when there is no real valuation data at all, and omits a metric column
 * entirely (never fills every row with "--") if RRC's own side of that
 * metric is unavailable, same discipline as buildPeerComparisonTable.
 */
export function buildValuationComparisonTable(payload: WeeklyReportPayload, budget: ContentBudget): TablePlan | null {
  const items = payload.modules.valuation ?? [];
  if (items.length === 0) return null;

  const rangeByMetric = new Map(items.filter((item) => item.metadata.isRange === true).map((item) => [item.metricKey, item]));
  const columns = VALUATION_METRIC_COLUMNS.filter((spec) => {
    const item = rangeByMetric.get(spec.metricKey);
    return item !== undefined && item.currentValue !== null;
  });
  if (columns.length === 0) return null;

  const peerTickers = [...new Set(items.filter((item) => item.metadata.isRange === false).map((item) => item.metadata.ticker).filter((t): t is string => typeof t === "string"))].sort();
  const { rows: selectedTickers, truncatedCount } = truncate(
    peerTickers.map((t) => ({ ticker: t })),
    budget.maxPeerCompanies
  );

  const byTickerAndMetric = new Map(items.map((item) => [`${item.metadata.ticker}:${item.metricKey}`, item]));

  const rows: TableRow[] = [Object.fromEntries([["company", "RRC"], ...columns.map((spec) => [spec.metricKey, rangeByMetric.get(spec.metricKey)!.displayValue])])];
  for (const { ticker } of selectedTickers) {
    rows.push(
      Object.fromEntries([
        ["company", ticker],
        ...columns.map((spec) => {
          const item = byTickerAndMetric.get(`${ticker}:${spec.metricKey}`);
          return [spec.metricKey, item && item.currentValue !== null ? item.displayValue : "--"];
        })
      ])
    );
  }

  const shownSourceLabels = new Set<string>();
  for (const spec of columns) {
    const rangeSource = rangeByMetric.get(spec.metricKey)?.metadata.source;
    if (typeof rangeSource === "string") shownSourceLabels.add(rangeSource);
    for (const { ticker } of selectedTickers) {
      const peerSource = byTickerAndMetric.get(`${ticker}:${spec.metricKey}`)?.metadata.source;
      if (typeof peerSource === "string") shownSourceLabels.add(peerSource);
    }
  }

  return {
    id: "valuation_comparison",
    title: "Valuation & Share-Price Context",
    columns: [{ key: "company", label: "Company", align: "left" }, ...columns.map((spec) => ({ key: spec.metricKey, label: spec.label, align: "right" as const }))],
    rows,
    sourceLine: shownSourceLabels.size > 0 ? [...shownSourceLabels].join("; ") : null,
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

/** Combines News's own persisted direction + strength into one compact cell (e.g. "moderate positive") -- both are already real, grounded facts from News's own AI analysis (see news-adapter.ts), never re-derived here. Same "strength direction" word order as commentary.ts's newsRangeImplication() sentence, so the table and the callout below it read consistently. */
function newsImpactCell(item: WeeklyEvidenceItem): string {
  const direction = item.materialityInputs.rangeImpactDirection;
  const strength = item.materialityInputs.rangeImpactStrength;
  if (!direction) return item.displayValue;
  return strength ? `${strength} ${direction}` : direction;
}

/**
 * Takes an explicit, already-filtered item list (not the whole payload) so
 * the three News-derived sections -- generic Material News, Company-Specific
 * News & Implications, Peer Developments That Matter to Range (see
 * evidence-sections.ts's partitionNewsItems) -- can each call this once with
 * their own partition rather than each re-reading and re-filtering
 * payload.modules.news themselves.
 */
export function buildNewsTable(items: WeeklyEvidenceItem[], budget: ContentBudget, id: string, title: string): TablePlan | null {
  if (items.length === 0) return null;
  const { rows, truncatedCount } = truncate(
    items.map((item) => ({
      headline: item.label,
      publisher: typeof item.metadata.publisher === "string" ? item.metadata.publisher : "--",
      date: item.asOfDate ?? "--",
      // metadata.category is NewsCategory[] (an article can carry more than one
      // tag, e.g. ["range","natural_gas"]) -- a previous version of this table
      // checked `typeof === "string"`, which is never true for the real shape,
      // so the column always rendered "--" in production.
      category: Array.isArray(item.metadata.category) && item.metadata.category.length > 0 ? item.metadata.category.join(", ") : "--",
      rangeImpact: newsImpactCell(item)
    })),
    budget.maxNewsRows
  );
  return {
    id,
    title,
    columns: [
      { key: "headline", label: "Headline", align: "left" },
      { key: "publisher", label: "Publisher", align: "left" },
      { key: "date", label: "Date", align: "left" },
      { key: "category", label: "Category", align: "left" },
      { key: "rangeImpact", label: "Range Impact", align: "left" }
    ],
    rows,
    sourceLine: "Persisted, analyzed News articles -- not re-fetched or re-analyzed for this report.",
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

/** Categories with a genuinely near-weekly observation cadence -- excludes quarterly-only categories (range_company, peers, valuation, forecast_scenarios) and monthly STEO, none of which have a real "next week" data point, so they'd never belong in a NEXT-WEEK watch list. */
const NEXT_WEEK_WATCH_CATEGORIES: EvidenceModuleKey[] = ["storage", "gas_pricing", "us_gas_supply", "appalachia_supply", "lng_demand", "power_data_center_demand", "industrial_demand", "rigs"];

/** The next Thursday on/after `fromIso` -- EIA's own weekly storage report release day, the one release date this codebase already has concrete, code-established knowledge of (see docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md's own note on the ~14:30-15:30 ET Thursday window). Every other tracked series' exact next release date is not reliably known here, so this helper is deliberately not reused for them -- they get "--" rather than a guessed date. */
function nextThursday(fromIso: string): string | null {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  const day = from.getUTCDay(); // 0=Sun..6=Sat, Thursday=4
  const daysUntilThursday = ((4 - day + 7) % 7) || 7;
  const next = new Date(from.getTime() + daysUntilThursday * 86_400_000);
  return next.toISOString().slice(0, 10);
}

/**
 * "Key Metrics to Watch Next Week" (IR-report enhancement, 2026-09-08).
 * Selects the highest-materiality items from categories with a real
 * near-week observation cadence, never a fixed count (however many clear
 * the budget's row cap, could be zero). "Next observation" is populated
 * only for storage (the one release date genuinely known in advance);
 * every other category gets "--" rather than a guessed date, per the
 * explicit "do not invent a date" instruction.
 */
export function buildKeyMetricsToWatchTable(payload: WeeklyReportPayload, budget: ContentBudget): TablePlan | null {
  const candidates = NEXT_WEEK_WATCH_CATEGORIES.flatMap((category) => payload.modules[category] ?? []);
  if (candidates.length === 0) return null;

  const ranked = rankEvidenceByMateriality(candidates);
  const { rows: selected, truncatedCount } = truncate(
    ranked.map((item) => ({
      metric: item.label,
      value: item.period ? `${item.displayValue} (${item.period})` : item.displayValue,
      whyItMatters: CATEGORY_WHY_IT_MATTERS[item.category] ?? "Tracked as part of Range's core weekly evidence set.",
      nextObservation: item.category === "storage" ? nextThursday(payload.dataCutoffAt) ?? "--" : "--"
    })),
    budget.maxKeyMetricsToWatch
  );

  return {
    id: "key_metrics_to_watch",
    title: "Key Metrics to Watch Next Week",
    columns: [
      { key: "metric", label: "Metric", align: "left" },
      { key: "value", label: "Latest Value (Period)", align: "left" },
      { key: "whyItMatters", label: "Why It Matters", align: "left" },
      { key: "nextObservation", label: "Next Observation", align: "left" }
    ],
    rows: selected,
    sourceLine: null,
    truncatedCount
  };
}

/**
 * "Guidance & Consensus Watch" (IR-report enhancement, 2026-09-08) --
 * reuses the existing company-guidance evidence (range-company-adapter.ts's
 * `guidance:*` metricKeys, already sourced from getCompanyGuidanceRecords)
 * rather than building a new guidance pipeline. Consensus is deliberately
 * NOT included: this project has no analyst-consensus data source, and
 * showing a guidance-only table under a "Guidance & Consensus" heading
 * without ever implying a consensus comparison exists is exactly the
 * "do not imply a consensus comparison exists when only guidance is
 * available" instruction -- so this is titled "Guidance Watch," not
 * "Guidance & Consensus Watch", whenever consensus data is absent (always,
 * today).
 */
export function buildGuidanceWatchTable(payload: WeeklyReportPayload, budget: ContentBudget): TablePlan | null {
  const guidanceItems = (payload.modules.range_company ?? []).filter((item) => item.metricKey.startsWith("guidance:"));
  if (guidanceItems.length === 0) return null;

  const { rows, truncatedCount } = truncate(
    guidanceItems.map((item) => ({
      metric: item.label,
      guidance: item.displayValue,
      period: item.period ?? "--",
      source: typeof item.metadata.source === "string" ? item.metadata.source : "--"
    })),
    budget.maxGuidanceRows
  );

  return {
    id: "guidance_watch",
    title: "Guidance Watch",
    columns: [
      { key: "metric", label: "Metric", align: "left" },
      { key: "guidance", label: "Company Guidance", align: "left" },
      { key: "period", label: "Period", align: "left" },
      { key: "source", label: "Source", align: "left" }
    ],
    rows,
    sourceLine: "Company-reported guidance only -- no analyst-consensus data source exists in this dashboard today; no consensus comparison is implied.",
    truncatedCount
  };
}

/**
 * "Upcoming Catalysts Calendar" (IR-report enhancement, 2026-09-08).
 * Deliberately minimal: the only future date this codebase can state with
 * real confidence is the next EIA weekly storage release (always the
 * following Thursday). Range/peer earnings dates, STEO's exact release day,
 * and regulatory/pipeline milestone dates all require a real calendar data
 * source this project doesn't have -- per the explicit "do not invent an
 * earnings date... if no reliable date exists, do not place the event on
 * the calendar" instruction, this function never guesses one. A future
 * phase could extend this once a real, approved calendar source exists;
 * until then, returning a single confirmed row (never an empty "no
 * catalysts" placeholder table, since the section itself is omitted by the
 * caller when this returns null) is the correct, honest behavior.
 */
export function buildCatalystsCalendarTable(payload: WeeklyReportPayload): TablePlan | null {
  const nextStorageDate = nextThursday(payload.dataCutoffAt);
  if (!nextStorageDate) return null;

  return {
    id: "catalysts_calendar",
    title: "Upcoming Catalysts Calendar",
    columns: [
      { key: "date", label: "Date", align: "left" },
      { key: "event", label: "Event", align: "left" },
      { key: "confidence", label: "Confidence", align: "left" }
    ],
    rows: [{ date: nextStorageDate, event: "EIA Weekly Natural Gas Storage Report", confidence: "Confirmed (recurring weekly release)" }],
    sourceLine: "Only confirmed, reliably-scheduled events are shown -- Range/peer earnings dates and other project milestones are omitted rather than estimated, since no calendar data source for them exists in this dashboard today.",
    truncatedCount: 0
  };
}

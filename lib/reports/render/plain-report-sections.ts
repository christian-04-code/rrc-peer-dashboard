import type { WeeklyAnalystAssessment } from "@/lib/reports/ai-contract";
import type { ComparisonResult, WeeklyEvidenceItem, WeeklyReportPayload } from "@/lib/reports/weekly-report-types";
import type { ColumnChartPlan, KpiTile, LineChartPlan, PeerBarPanel, RiskLevel, RiskTableRow } from "@/lib/reports/render/render-model";

/**
 * Plain-English report pass (2026-10-13): deterministic builders for the
 * redesigned report's KPI tiles, trend charts, peer panels, and risk table.
 * Same rule as the rest of render/: every number printed here is read
 * straight off a frozen evidence item, comparison, or chartSeries point --
 * nothing is recalculated, and an absent input produces an absent tile/
 * chart/row, never a placeholder value.
 */

function findItem(payload: WeeklyReportPayload, category: keyof WeeklyReportPayload["modules"], metricKey: string): WeeklyEvidenceItem | null {
  const item = (payload.modules[category] ?? []).find((candidate) => candidate.metricKey === metricKey);
  return item && item.currentValue !== null ? item : null;
}

function findComparison(item: WeeklyEvidenceItem, period: ComparisonResult["period"]): ComparisonResult | null {
  const comparison = item.comparisons.find((c) => c.period === period);
  return comparison && comparison.direction !== "unavailable" && comparison.deltaPct !== null ? comparison : null;
}

/** "Up 3.1% from a week earlier" -- plain words around the comparison's own already-computed deltaPct. */
function changePhrase(comparison: ComparisonResult | null, against: string): string | null {
  if (!comparison || comparison.deltaPct === null) return null;
  if (comparison.direction === "flat") return `Unchanged ${against}`;
  return `${comparison.direction === "up" ? "Up" : "Down"} ${Math.abs(comparison.deltaPct).toFixed(1)}% ${against}`;
}

export function buildKpiTiles(payload: WeeklyReportPayload): KpiTile[] {
  const tiles: KpiTile[] = [];

  const henryHub = findItem(payload, "gas_pricing", "henry_hub_spot");
  if (henryHub) {
    tiles.push({ label: "Henry Hub Gas Price", value: henryHub.displayValue, change: changePhrase(findComparison(henryHub, "WoW"), "from a week earlier"), period: henryHub.period });
  }

  const storage = findItem(payload, "storage", "lower48_storage");
  if (storage) {
    const vsAvg = findComparison(storage, "vs5yrAvg");
    const change = vsAvg && vsAvg.deltaPct !== null
      ? vsAvg.direction === "flat"
        ? "In line with the 5-year average"
        : `${Math.abs(vsAvg.deltaPct).toFixed(1)}% ${vsAvg.direction === "up" ? "above" : "below"} the 5-year average`
      : null;
    tiles.push({ label: "Gas in Storage (U.S.)", value: storage.displayValue, change, period: storage.period });
  }

  const fcf = findItem(payload, "range_company", "free_cash_flow");
  if (fcf) {
    tiles.push({ label: `Range Free Cash Flow (${fcf.period ?? "latest qtr"})`, value: fcf.displayValue, change: changePhrase(findComparison(fcf, "QoQ"), "from the prior quarter"), period: fcf.period });
  }

  const leverage = findItem(payload, "range_company", "net_debt_to_ltm_ebitdax");
  if (leverage) {
    tiles.push({ label: "Range Debt-to-Earnings Ratio", value: leverage.displayValue, change: "Net debt / last-12-month EBITDAX", period: leverage.period });
  }

  return tiles;
}

function sourceLabel(payload: WeeklyReportPayload, sourceId: string): string {
  return payload.sourceManifest.generatedFrom.find((entry) => entry.key === sourceId)?.label ?? sourceId;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function longDate(period: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);
  return match ? `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}` : period;
}

export function buildMarketCharts(payload: WeeklyReportPayload): LineChartPlan[] {
  const charts: LineChartPlan[] = [];
  const henryHub = payload.chartSeries?.henryHubDaily;
  if (henryHub && henryHub.points.length >= 2) {
    const first = henryHub.points[0];
    const last = henryHub.points[henryHub.points.length - 1];
    charts.push({
      id: "chart:henry_hub_daily",
      title: "Henry Hub Natural Gas Price ($/MMBtu, daily)",
      valueFormat: "usd_per_mmbtu",
      series: [{ label: "Henry Hub spot", style: "primary", points: henryHub.points.map((p) => ({ x: p.period, y: p.value })) }],
      caption: `Henry Hub was $${last.value.toFixed(2)} on ${longDate(last.period)}, compared with $${first.value.toFixed(2)} on ${longDate(first.period)}.`,
      sourceLine: sourceLabel(payload, henryHub.sourceId)
    });
  }

  const storage = payload.chartSeries?.storageWeekly;
  if (storage && storage.points.length >= 2) {
    const item = findItem(payload, "storage", "lower48_storage");
    const vsAvg = item ? findComparison(item, "vs5yrAvg") : null;
    const last = storage.points[storage.points.length - 1];
    const position = vsAvg && vsAvg.deltaPct !== null
      ? vsAvg.direction === "flat"
        ? "in line with"
        : `${Math.abs(vsAvg.deltaPct).toFixed(1)}% ${vsAvg.direction === "up" ? "above" : "below"}`
      : null;
    charts.push({
      id: "chart:storage_vs_5yr",
      title: "Natural Gas in Storage vs. Five-Year Average (Lower 48, Bcf)",
      valueFormat: "bcf",
      series: [
        { label: "Gas in storage", style: "primary", points: storage.points.map((p) => ({ x: p.period, y: p.value })) },
        { label: "5-year average", style: "reference", points: storage.points.map((p) => ({ x: p.period, y: p.fiveYearAverage })) }
      ],
      caption: position
        ? `Storage was ${new Intl.NumberFormat("en-US").format(last.value)} Bcf for the week ending ${longDate(last.period)}, ${position} the five-year average. More gas in storage than normal usually weighs on prices.`
        : `Storage was ${new Intl.NumberFormat("en-US").format(last.value)} Bcf for the week ending ${longDate(last.period)}.`,
      sourceLine: sourceLabel(payload, storage.sourceId)
    });
  }
  return charts;
}

function shortQuarter(quarter: string): string {
  const match = /^(Q[1-4]) (\d{4})$/.exec(quarter);
  return match ? `${match[1]} '${match[2].slice(2)}` : quarter;
}

function moneyLabel(value: number): string {
  const rounded = Math.round(value);
  return `${rounded < 0 ? "-" : ""}$${new Intl.NumberFormat("en-US").format(Math.abs(rounded))}MM`;
}

export function buildRangeFcfChart(payload: WeeklyReportPayload): ColumnChartPlan | null {
  const series = payload.chartSeries?.rangeFcfQuarterly;
  if (!series || series.points.length < 2) return null;
  const last = series.points[series.points.length - 1];
  return {
    id: "chart:rrc_fcf_quarterly",
    title: "Range Quarterly Free Cash Flow ($MM)",
    bars: series.points.map((p) => ({ label: shortQuarter(p.period), value: p.value, displayValue: moneyLabel(p.value) })),
    caption: `Range generated ${moneyLabel(last.value)} of free cash flow in ${last.period}. Free cash flow is cash from operations (before working-capital changes) minus capital spending.`,
    sourceLine: sourceLabel(payload, series.sourceId)
  };
}

type PeerPanelSpec = { id: string; title: string; hint: string; rangeCategory: "valuation" | "range_company"; rangeMetricKey: string; peerCategory: "valuation" | "peers"; peerMetricKey: string };

const PEER_PANELS: PeerPanelSpec[] = [
  { id: "peer:ev_to_ebitdax", title: "Valuation: EV / EBITDAX", hint: "Lower = the market values the company more cheaply", rangeCategory: "valuation", rangeMetricKey: "ev_to_ltm_ebitdax", peerCategory: "valuation", peerMetricKey: "ev_to_ltm_ebitdax" },
  { id: "peer:fcf_yield", title: "Free Cash Flow Yield (last 12 months)", hint: "Higher = more cash per dollar of market value", rangeCategory: "valuation", rangeMetricKey: "ltm_fcf_yield", peerCategory: "valuation", peerMetricKey: "ltm_fcf_yield" },
  { id: "peer:leverage", title: "Debt: Net Debt / EBITDAX", hint: "Lower = less debt relative to earnings", rangeCategory: "range_company", rangeMetricKey: "net_debt_to_ltm_ebitdax", peerCategory: "peers", peerMetricKey: "net_debt_to_ebitdax" }
];

/** Range + every peer with a real value for the same metric and period, highest value first. A panel is dropped entirely when Range's own value or every peer value is missing. */
export function buildPeerPanels(payload: WeeklyReportPayload): { panels: PeerBarPanel[]; period: string | null } {
  const panels: PeerBarPanel[] = [];
  let period: string | null = null;
  for (const spec of PEER_PANELS) {
    const rangeItem = (payload.modules[spec.rangeCategory] ?? []).find((item) => item.metricKey === spec.rangeMetricKey && item.currentValue !== null && (spec.rangeCategory !== "valuation" || item.metadata.isRange === true));
    if (!rangeItem || rangeItem.currentValue === null) continue;
    const peerItems = (payload.modules[spec.peerCategory] ?? []).filter(
      (item) => item.metricKey === spec.peerMetricKey && item.currentValue !== null && item.metadata.isRange !== true && typeof item.metadata.ticker === "string" && item.period === rangeItem.period
    );
    if (peerItems.length === 0) continue;
    period = period ?? rangeItem.period;
    const bars = [
      { label: "RRC", value: rangeItem.currentValue, displayValue: rangeItem.displayValue, isRange: true },
      ...peerItems.map((item) => ({ label: String(item.metadata.ticker), value: item.currentValue as number, displayValue: item.displayValue, isRange: false }))
    ].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    panels.push({ id: spec.id, title: spec.title, hint: spec.hint, bars });
  }
  return { panels, period };
}

const RISK_LEVEL_BY_STATE: Record<string, RiskLevel> = { HIGH_RISK: "High", MODERATE_RISK: "Medium", WATCH: "Low" };

/** Plain-English risk names keyed by the risk engine's driver -- a label mapping only; which risks appear and how severe they are stays entirely the engine's call. */
const PLAIN_RISK_NAME: Record<string, string> = {
  gas_pricing: "Lower natural gas prices",
  storage_levels: "Gas storage above normal",
  us_gas_supply: "U.S. gas supply growing faster than demand",
  appalachia_supply: "More Appalachian supply pushing local prices down",
  lng_demand: "Weaker LNG export demand",
  power_data_center_demand: "Weaker power-plant gas demand",
  industrial_demand: "Soft industrial gas demand"
};

/**
 * Rows come from the deterministic risk engine's own non-supportive signals,
 * in its own rank order, with its own state mapped to High/Medium/Low. The
 * AI's validated riskTable only supplies the explanation text; when an
 * assessment predates that field, the engine's own reason text is used and
 * the "What Range Can Do" cells stay empty rather than invented.
 */
export function buildRiskTable(payload: WeeklyReportPayload, assessment: WeeklyAnalystAssessment, maxRows: number): RiskTableRow[] {
  const aiRows = new Map((assessment.riskTable ?? []).map((row) => [row.evidenceId, row]));
  const candidates = [...(payload.modules.deterministic_risk_opportunity ?? [])]
    .filter((item) => typeof item.metadata.riskState === "string" && RISK_LEVEL_BY_STATE[item.metadata.riskState] !== undefined)
    .sort((a, b) => Number(a.metadata.riskRank ?? 99) - Number(b.metadata.riskRank ?? 99));
  const covered = aiRows.size > 0 ? candidates.filter((item) => aiRows.has(item.evidenceId)) : candidates;

  return covered.slice(0, maxRows).map((item) => {
    const ai = aiRows.get(item.evidenceId);
    return {
      risk: PLAIN_RISK_NAME[item.metricKey] ?? item.label,
      level: RISK_LEVEL_BY_STATE[item.metadata.riskState as string],
      whyItMatters: ai?.whyItMatters ?? (typeof item.metadata.deterministicReason === "string" ? item.metadata.deterministicReason : item.label),
      announced: ai?.announcedAction ?? null,
      possible: ai?.possibleResponse ?? null
    };
  });
}

/**
 * Plain-English sentence for Range's guided gas differential, read from the guidance
 * record's own low/high and sign (negative = below the NYMEX benchmark). Falls back to the
 * record's display string when the bounds are missing or straddle zero.
 */
function describeGasDifferential(item: WeeklyEvidenceItem): string {
  const low = typeof item.metadata.low === "number" ? item.metadata.low : null;
  const high = typeof item.metadata.high === "number" ? item.metadata.high : null;
  const source = String(item.metadata.source ?? "company guidance");
  const period = item.period ? `${item.period} ` : "";
  if (low !== null && high !== null && Math.sign(low) === Math.sign(high) && low !== 0) {
    const [a, b] = [Math.abs(low), Math.abs(high)].sort((x, y) => x - y);
    return `Range guides its ${period}natural gas price to average $${a.toFixed(2)} to $${b.toFixed(2)} per Mcf ${low < 0 ? "below" : "above"} NYMEX (${source}).`;
  }
  return `Range's ${period}gas differential guidance is ${item.displayValue} (${source}).`;
}

export function buildChartGaps(payload: WeeklyReportPayload): string[] {
  const differential = (payload.modules.range_company ?? []).find((item) => item.metricKey === "guidance:gas_differential");
  const gaps = [
    "Appalachian gas prices vs. Henry Hub: not charted. The dashboard has no verified Appalachian hub price feed (for example Eastern Gas South or Tetco M2); adding one requires a licensed price source." +
      (differential ? ` For reference: ${describeGasDifferential(differential)}` : "")
  ];
  if (!payload.chartSeries) gaps.push("Trend charts are unavailable for this snapshot because it was frozen before chart history was stored.");
  return gaps;
}

/**
 * Phase 7D -- the typed intermediate report-render model. This is the ONE
 * shape the HTML template (html-template.ts) is allowed to read from; it
 * never reaches back into a raw WeeklyReportPayload or WeeklyAnalystAssessment
 * itself (see render-model-builder.ts, the only place that constructs one).
 * Keeping this boundary means the template stays a dumb presentation layer,
 * and every fact it prints was already decided, formatted, and bounded by
 * deterministic code before it ever reaches template string interpolation.
 *
 * Nothing in this file computes anything -- pure types only, same convention
 * weekly-report-types.ts and ai-contract.ts already established for their
 * own layers.
 */

export type RenderBudgetTier = "standard" | "reduced";

/** One labeled bar in a deterministic chart -- never a continuous multi-point trend line, because the frozen WeeklyReportPayload only ever carries a small number of named comparison points (current + WoW/YoY/vs5yrAvg/MoM/QoQ/steoVintage) per item, never a full historical series (see chart-selection.ts's file header for why). */
export type ChartBar = {
  label: string;
  value: number;
  displayValue: string;
};

export type ChartKind = "comparisonBar" | "multiItemBar" | "peerBar" | "actualVsForecastBar";

export type ChartPlan = {
  id: string;
  kind: ChartKind;
  title: string;
  unit: string | null;
  bars: ChartBar[];
  /** One deterministic, evidence-grounded sentence describing what the chart shows -- composed by commentary.ts, never AI-generated. */
  caption: string;
  sourceLine: string;
};

export type TableColumn = {
  key: string;
  label: string;
  align: "left" | "right";
};

export type TableRow = Record<string, string>;

export type TablePlan = {
  id: string;
  title: string;
  columns: TableColumn[];
  rows: TableRow[];
  sourceLine: string | null;
  /** True when rows were truncated by a content-budget cap -- rendered as a small "+N more" footnote rather than silently dropped (project convention: no silent caps). */
  truncatedCount: number;
};

export type EvidenceSection = {
  id: string;
  heading: string;
  chart: ChartPlan | null;
  table: TablePlan | null;
  /** 1-3 deterministic sentences, composed from typed evidence fields only -- see commentary.ts. */
  commentary: string[];
  rangeImplication: string | null;
};

export type ReportIdentity = {
  title: string;
  subtitle: string;
  weekEndingLabel: string;
  dataCutoffLabel: string;
};

export type CalloutItem = {
  title: string;
  body: string;
  /** "What Changed This Week?" cards only: helps / hurts / mixed for Range, from the AI's validated `impact` tag. Null when the assessment predates that field. */
  impact?: "positive" | "negative" | "mixed" | null;
};

// ---------------------------------------------------------------------------
// Plain-English report pass (2026-10-13) -- trend charts, KPI tiles, risk table
// ---------------------------------------------------------------------------

/** A real time series from WeeklyReportPayload.chartSeries. `y` is null where a reference line has no value for that point (drawn as a gap, never bridged). */
export type LineSeries = { label: string; style: "primary" | "reference"; points: { x: string; y: number | null }[] };

export type LineChartPlan = {
  id: string;
  title: string;
  valueFormat: "usd_per_mmbtu" | "bcf";
  series: LineSeries[];
  /** One plain-English, deterministic sentence of what the chart shows. */
  caption: string;
  sourceLine: string;
};

export type ColumnChartPlan = {
  id: string;
  title: string;
  bars: ChartBar[];
  caption: string;
  sourceLine: string;
};

export type PeerBarPanel = {
  id: string;
  title: string;
  /** A short plain-English reading guide, e.g. "Lower = less debt". */
  hint: string;
  bars: { label: string; value: number; displayValue: string; isRange: boolean }[];
};

export type KpiTile = {
  label: string;
  value: string;
  /** e.g. "Down 4.7% vs. last week" -- straight from the item's own comparison, never recomputed. */
  change: string | null;
  period: string | null;
};

export type RiskLevel = "High" | "Medium" | "Low";

export type RiskTableRow = {
  risk: string;
  /** Mapped 1:1 from the deterministic risk engine's own state (HIGH_RISK -> High, MODERATE_RISK -> Medium, WATCH -> Low) -- never AI-chosen. */
  level: RiskLevel;
  whyItMatters: string;
  /** Only something Range has actually announced (AI-cited Range guidance/News). */
  announced: string | null;
  /** Where the announced action comes from -- the cited guidance record's / News item's own source label, resolved deterministically from the AI's cited evidence ids. */
  announcedSource: string | null;
  /** An option Range could consider -- always rendered with "Could consider" framing. */
  possible: string | null;
};

/**
 * "Investor Questions to Prepare For" (IR-report enhancement, 2026-09-08).
 * The one AI-synthesized (not deterministic) new section -- every field
 * still traces to the same evidenceAllowlist every other AI field does (see
 * ai-contract.ts's WeeklyAnalystInvestorQuestion), and `responseFramework`
 * is always rendered with an explicit "preparation based on public
 * information, not an official Range statement" label, never presented as
 * an actual management position.
 */
export type InvestorQuestionItem = {
  question: string;
  whyNow: string;
  context: string | null;
  responseFramework: string | null;
  followUpNeeded: string | null;
};

export type WeeklyReportRenderModel = {
  identity: ReportIdentity;
  /** Already split into paragraphs (Phase 7C.1's 2-3 paragraph executiveAssessment) -- the template renders one <p> per entry, never re-splits prose itself. */
  executiveAssessmentParagraphs: string[];
  atAGlanceTable: TablePlan;
  biggestRisk: CalloutItem | null;
  biggestOpportunity: CalloutItem | null;
  whatChanged: CalloutItem[];
  evidenceSections: EvidenceSection[];
  keyRisksAndOpportunitiesTable: TablePlan | null;
  managementWatchItems: CalloutItem[];
  bottomLine: string;
  sourcesFreshnessTable: TablePlan;
  generatedAtLabel: string;
  budgetTier: RenderBudgetTier;
  /** Human-readable labels of candidate content dropped by the content budget (e.g. "News" when no room remained) -- surfaced in a small footer note rather than silently vanishing. Empty when nothing was dropped. */
  omittedContentLabels: string[];
  /** Empty most weeks by design -- see InvestorQuestionItem's own header. Never padded to a minimum count. */
  investorQuestions: InvestorQuestionItem[];
  /** Null whenever no reliably-dated future event exists (see buildCatalystsCalendarTable) -- never an empty placeholder table. */
  catalystsCalendarTable: TablePlan | null;
  /** Fixed headline numbers for page 1 (Henry Hub, storage vs. 5-yr avg, RRC FCF, RRC leverage) -- whichever exist this week. */
  kpiTiles: KpiTile[];
  /** Henry Hub + storage trend charts; empty for snapshots frozen before chartSeries existed. */
  marketCharts: LineChartPlan[];
  rangeFcfChart: ColumnChartPlan | null;
  peerPanels: PeerBarPanel[];
  peerPanelsPeriod: string | null;
  riskTable: RiskTableRow[];
  /** Charts the brief asked for that this dashboard has no verified data for -- printed as an honest note, never drawn from guessed values. */
  chartGaps: string[];
};

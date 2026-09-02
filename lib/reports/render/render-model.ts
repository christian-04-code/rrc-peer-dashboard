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
};

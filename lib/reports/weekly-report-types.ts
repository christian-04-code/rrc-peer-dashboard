/**
 * Phase 7A -- Weekly Range Resources AI Intelligence Report: core domain
 * types and identity contract. This file defines the shared vocabulary for
 * the whole Phase 7 subsystem; it does not build the snapshot, call AI,
 * render charts, or render a PDF -- those are Phase 7B+ (see
 * docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md for the full architecture and
 * what remains).
 *
 * This is its own subsystem, deliberately separate from lib/market/ (Macro)
 * and lib/news/ -- Phase 7 *reads* validated output from both as inputs,
 * the same "separate subsystem, no reverse dependency" boundary Phase 6A
 * drew between Macro and News. Nothing in lib/market/ or lib/news/ should
 * ever import from lib/reports/.
 */

// ---------------------------------------------------------------------------
// Report identity (Phase 7A decision #1)
// ---------------------------------------------------------------------------

/**
 * YYYY-MM-DD. The EIA Weekly Natural Gas Storage report's "week ending"
 * date -- always a Friday -- not a generic calendar week and not a
 * generation timestamp. EIA publishes this report every Thursday (shifting
 * to another weekday around federal holidays), but the week-ending date
 * itself is always the Friday the reported storage week closed on,
 * regardless of when EIA actually publishes it. That is what makes it a
 * stable, idempotent report identity: a cron that runs late, or is retried,
 * or fires the day after a holiday-shifted release, still resolves to the
 * same identity as an on-time run would have -- never a new one.
 */
export type StorageWeekEnding = string;

const STORAGE_WEEK_ENDING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a well-formed YYYY-MM-DD calendar date that falls on a
 * Friday (UTC) -- the one shape rule the report identity must satisfy.
 * Deliberately does NOT check that EIA has actually published a storage
 * observation for this date; that is a data-readiness concern (see
 * readiness.ts's eiaWeeklyStorageObservation input), not an identity-format
 * concern -- keeping them separate means a malformed identity and a missing
 * observation fail with two different, specific errors instead of one
 * conflated one.
 */
export function isValidStorageWeekEnding(value: string): boolean {
  if (!STORAGE_WEEK_ENDING_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  if (date.toISOString().slice(0, 10) !== value) return false; // rejects e.g. 2026-02-30 (JS Date normalizes it forward rather than erroring)
  return date.getUTCDay() === 5; // Friday
}

// ---------------------------------------------------------------------------
// Publication lifecycle (Phase 7A decision #3)
// ---------------------------------------------------------------------------

export const WEEKLY_REPORT_STATUSES = ["pending", "building", "ready", "published", "failed"] as const;
export type WeeklyReportStatus = (typeof WEEKLY_REPORT_STATUSES)[number];

/**
 * Legal forward transitions. This is the same state graph
 * report-repo.ts's atomic `UPDATE ... WHERE status = $expected` calls
 * enforce at the DB layer (and weekly_report_snapshots' partial unique
 * indexes enforce at the schema layer) -- documented here in one place so
 * the graph is testable independent of SQL, and so a future caller can
 * validate an intended transition before issuing the query.
 */
export const WEEKLY_REPORT_STATUS_TRANSITIONS: Record<WeeklyReportStatus, WeeklyReportStatus[]> = {
  pending: ["building", "failed"],
  building: ["ready", "failed"],
  ready: ["published", "failed"],
  // Terminal: a published report is never edited or transitioned away from
  // in place. A correction for the same or a later week is always a new
  // row, never a mutation of a published one (Phase 7A decision #3's "a
  // failed new report must never replace the previous valid published
  // report" -- the inverse also holds: a published report is never
  // replaced in place by anything, valid or not).
  published: [],
  // Terminal for this row -- a retry after failure creates a new row (see
  // schema.sql's weekly_report_snapshots_active_week_key comment for why
  // that is safe: failed rows are excluded from the "one active attempt per
  // week" constraint).
  failed: []
};

export function isValidStatusTransition(from: WeeklyReportStatus, to: WeeklyReportStatus): boolean {
  return WEEKLY_REPORT_STATUS_TRANSITIONS[from].includes(to);
}

export const WEEKLY_REPORT_SCHEMA_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Source / freshness manifest (Phase 7A decision #2 & #6)
// ---------------------------------------------------------------------------

/** One entry per input the report drew from -- required or optional. Mirrors the freshness vocabulary already used across Macro (calculateFreshness/MarketFreshness) rather than inventing a parallel one. */
export type SourceManifestEntry = {
  key: string;
  label: string;
  period: string | null;
  freshness: "current" | "lagged" | "stale" | "unavailable";
  included: boolean;
};

export type SourceFreshnessManifest = {
  generatedFrom: SourceManifestEntry[];
};

// ---------------------------------------------------------------------------
// Frozen structured intelligence payload (Phase 7A decision #2)
// ---------------------------------------------------------------------------

/**
 * The frozen payload stored in weekly_report_snapshots.payload once a draft
 * reaches "ready". Deliberately a loose JSON envelope, not a fully
 * normalized relational shape -- consistent with this project's existing
 * convention of not over-normalizing a first schema when a structured
 * JSONB payload is appropriate (see macro_risk_summaries.risk_signals for
 * precedent). `modules` is intentionally `Record<string, unknown>` here:
 * Phase 7B (the actual snapshot builder) is what decides its real internal
 * shape per evidence module; fixing that shape now, before a single real
 * builder exists, would be guessing. The outer envelope below is what
 * Phase 7A commits to so later phases have a stable place to add fields
 * without a schema migration.
 */
export type WeeklyReportPayload = {
  schemaVersion: string;
  storageWeekEnding: StorageWeekEnding;
  dataCutoffAt: string;
  /**
   * Phase 7B: replaced Phase 7A's placeholder `Record<string, unknown>` with
   * the real typed evidence structure once a real snapshot builder existed
   * to populate it (see WeeklyReportModules below). Not every key is present
   * every week -- an absent key means that category was optional and
   * degraded this week (see readiness.ts), never an empty/zero-filled array
   * standing in for "no data."
   */
  modules: WeeklyReportModules;
  sourceManifest: SourceFreshnessManifest;
};

// ---------------------------------------------------------------------------
// Comparison contract (Phase 7A decision #5) -- interfaces only, nothing here computes a comparison
// ---------------------------------------------------------------------------

export type ComparisonPeriod =
  | "WoW"
  | "MoM"
  | "QoQ"
  | "YoY"
  | "vs5yrAvg"
  | "percentileRange"
  | "steoVintage"
  | "priorQuarterActuals"
  | "peerChange"
  | "forecastRevision";

export type ComparisonDirection = "up" | "down" | "flat" | "unavailable";

/**
 * The shape any future comparison calculation (Phase 7B) must return.
 * `previousValue`/`delta`/`deltaPct` are null, and `direction` is
 * "unavailable", whenever no real previous snapshot/vintage exists to
 * compare against -- never fabricated, mirroring
 * lib/market/macro-risk-engine.ts's computeSignalChanges, which returns an
 * empty result rather than inventing a "from" state before a real prior
 * snapshot exists.
 */
export type ComparisonResult = {
  period: ComparisonPeriod;
  metricKey: string;
  label: string;
  currentValue: number | null;
  previousValue: number | null;
  delta: number | null;
  deltaPct: number | null;
  direction: ComparisonDirection;
  /** Human-readable basis, e.g. "vs. week ending 2026-08-21" -- null exactly when direction is "unavailable". */
  basisDescription: string | null;
};

// ---------------------------------------------------------------------------
// Report content contract (Phase 7A decision #8) -- presentation model only
// ---------------------------------------------------------------------------

/**
 * Modules are dynamically selected per week (Phase 7A decision #8: "select
 * what materially matters that week", not a fixed mandatory section list).
 * This union is the known vocabulary of *candidate* modules a future
 * builder may choose to include -- inclusion itself is a Phase 7B decision,
 * not fixed here.
 */
export type EvidenceModuleKey =
  | "gas_pricing"
  | "storage"
  | "us_gas_supply"
  | "appalachia_supply"
  | "lng_demand"
  | "power_data_center_demand"
  | "industrial_demand"
  | "steo_outlook"
  | "rigs"
  | "peers"
  | "news"
  | "forecast_scenarios"
  // Added in Phase 7B once a real snapshot builder needed them -- additive
  // only, nothing above was renamed or removed, so this is not a Phase 7A
  // redesign. "range_company" holds Range's own quarterly financial/
  // operating results and management guidance (distinct from "peers",
  // which holds comparative peer-company positioning on the same metrics).
  // "deterministic_risk_opportunity" holds lightweight *pointers* into the
  // deterministic Macro risk engine's ranked signals (rank + state +
  // reference to the underlying evidence item), not a duplicate copy of
  // those signals' own metrics -- see comparisons.ts's file header for why.
  | "range_company"
  | "deterministic_risk_opportunity";

export type ChartKind = "line" | "bar" | "map" | "table";

/** Per Phase 7A decision #9: charts are deterministic, rendered from already-validated data -- this type fixes only the presentation metadata (caption/source line, per the July report's visual grammar), not chart data itself. */
export type ChartSpec = {
  id: string;
  kind: ChartKind;
  title: string;
  caption: string;
  sourceLine: string;
};

export type EvidenceItem = {
  id: string;
  moduleKey: EvidenceModuleKey;
  label: string;
  metrics: { label: string; value: string }[];
  comparisons: ComparisonResult[];
  chart: ChartSpec | null;
  sourceLabel: string;
  period: string | null;
};

/**
 * Page 1's fixed structural slots (Phase 7A decision #8) plus the dynamic
 * evidenceModules array for pages 2-4 and the closing-area fields. This is
 * the model a future PDF renderer (Phase 7D) consumes -- it does not exist
 * yet; this type only fixes what the renderer will be able to rely on
 * being present.
 */
export type ReportContentModel = {
  title: string;
  subtitle: string;
  weekEndingLabel: string;
  executiveAssessment: string;
  atAGlanceMetrics: { label: string; value: string }[];
  biggestRisk: EvidenceItem | null;
  biggestOpportunity: EvidenceItem | null;
  whatChanged: ComparisonResult[];
  /** Pages 2-4: dynamically selected, not a fixed mandatory list -- see EvidenceModuleKey's comment. */
  evidenceModules: EvidenceItem[];
  keyRisksAndOpportunities: EvidenceItem[];
  managementWatchItems: string[];
  bottomLine: string;
  sources: SourceManifestEntry[];
};

// ---------------------------------------------------------------------------
// Weekly evidence model (Phase 7B) -- the real, typed replacement for Phase
// 7A's placeholder `modules: Record<string, unknown>`. Distinct from
// EvidenceItem/ReportContentModel above: EvidenceItem is Phase 7D's
// *curated, presentation-ready* selection for the rendered report;
// WeeklyEvidenceItem below is the *full, frozen, auditable* dataset a
// snapshot actually stores, from which Phase 7C/7D later select.
// ---------------------------------------------------------------------------

/**
 * Deterministic materiality SIGNALS, not a blended score (Phase 7B
 * decision: a single opaque numeric "materiality score" would itself be a
 * kind of undocumented judgment call; these are the raw, transparent,
 * independently-meaningful facts Phase 7C/7D can weigh however they choose).
 * Every field is optional/nullable per item -- a news item has no
 * riskSeverityRank, a risk-engine item has no rangeImpactStrength, etc.
 */
export type MaterialityInputs = {
  /** True iff this evidenceId did not exist in the previous published snapshot's modules. */
  isNewThisWeek: boolean;
  /** True iff this evidenceId existed in the previous published snapshot and its value/state differs. */
  changedSincePreviousReport: boolean;
  /** 1 = most severe, from the deterministic Macro risk engine's ranking -- null for non-risk-engine items. */
  riskSeverityRank: number | null;
  /** The deterministic Macro risk engine's classification -- null for non-risk-engine items. */
  riskState: "HIGH_RISK" | "MODERATE_RISK" | "WATCH" | "SUPPORTIVE" | "UNAVAILABLE" | null;
  /** From persisted News AI analysis only -- null for non-News items, and null (never guessed) for a News item whose analysis is itself null. */
  rangeImpactDirection: string | null;
  rangeImpactStrength: string | null;
  /** The largest |deltaPct| among this item's own comparisons -- null if every comparison is unavailable or the item has none. */
  comparisonMagnitudePct: number | null;
};

/**
 * A simple, deterministic, documented three-way split -- NOT a numeric
 * score. "high" if the item is new, changed since the previous report, at
 * HIGH_RISK/MODERATE_RISK, carries a "high" News impact strength, or moved
 * by at least MATERIAL_COMPARISON_MAGNITUDE_PCT; "routine" otherwise. See
 * materiality.ts for the implementation and MATERIAL_COMPARISON_MAGNITUDE_PCT's
 * value/rationale.
 */
export type InformationLevel = "high" | "routine";

export type WeeklyEvidenceItem = {
  /**
   * Stable and deterministic across runs for the *same underlying fact* --
   * built from category + metricKey + period (see each adapter for its
   * exact scheme), never a random id or a DB-generated one, so the same
   * real-world observation always gets the same evidenceId whether this is
   * the first time it's ever been collected or the tenth week it has
   * appeared unchanged.
   */
  evidenceId: string;
  category: EvidenceModuleKey;
  /** Stable key for the specific metric/event within its category, e.g. "henry_hub_spot", "lower48_storage", "rrc_revenue", "risk:gas_pricing", "article:<articleId>". */
  metricKey: string;
  label: string;
  currentValue: number | null;
  displayValue: string;
  unit: string | null;
  /** The underlying data's own period, in whatever grain that series actually reports at -- "2026-08-28" (weekly), "2026-07" (monthly), "Q2 2026" (quarterly). Never the fetch/generation time. */
  period: string | null;
  /** ISO date this value is as-of, derived from `period` -- never `new Date()`/fetch time. */
  asOfDate: string | null;
  /** Keys into the frozen SourceFreshnessManifest's `generatedFrom` entries (by their own `key`), so every fact stays traceable to a specific, freshness-stamped source. */
  sourceIds: string[];
  freshness: "current" | "lagged" | "stale" | "unavailable";
  /** Computed only where logically valid for this item's own underlying data period (Phase 7B decision -- see comparisons.ts) -- never forced to cover every ComparisonPeriod. */
  comparisons: ComparisonResult[];
  /** Range driver taxonomy keys (lib/range-impact-framework.ts) this item relates to -- [] if genuinely none apply, never guessed. */
  rangeDrivers: string[];
  materialityInputs: MaterialityInputs;
  /** Category-specific extras that don't warrant their own top-level field (e.g. a News item's headline/url/publisher, a risk item's deterministic reason text, a guidance record's operator/status). Never a second, conflicting copy of currentValue/displayValue. */
  metadata: Record<string, unknown>;
};

/** Not every key present every week -- see WeeklyReportPayload.modules' own comment. */
export type WeeklyReportModules = Partial<Record<EvidenceModuleKey, WeeklyEvidenceItem[]>>;

// ---------------------------------------------------------------------------
// Deterministic weekly change set (Phase 7B) -- structured facts only, no
// prose conclusions; Phase 7C's future AI narrates these, it does not
// discover them.
// ---------------------------------------------------------------------------

export type WeeklyChangeKind =
  | "new_observation"
  | "value_changed"
  | "risk_state_changed"
  | "risk_rank_changed"
  | "new_steo_vintage"
  | "new_company_result_or_guidance"
  | "material_peer_change"
  | "new_retained_news_item"
  | "forecast_revision";

/**
 * Purely structural -- every field is a plain value/state, not a sentence.
 * Computed by diffing the current snapshot's modules against the previous
 * *published* snapshot's modules (never by comparing a metric's own value
 * to itself when the underlying data period hasn't actually advanced --
 * see changes.ts's file header for the "same April production in two
 * consecutive weekly snapshots is not a weekly change" rule this type
 * exists to respect).
 */
export type WeeklyChange = {
  kind: WeeklyChangeKind;
  evidenceId: string;
  category: EvidenceModuleKey;
  label: string;
  fromValue: string | null;
  toValue: string | null;
  fromState: string | null;
  toState: string | null;
};

// ---------------------------------------------------------------------------
// Persisted record shape (maps 1:1 to weekly_report_snapshots; see report-repo.ts)
// ---------------------------------------------------------------------------

export type WeeklyReportSnapshotRecord = {
  id: string;
  storageWeekEnding: StorageWeekEnding;
  status: WeeklyReportStatus;
  schemaVersion: string;
  failedReason: string | null;
  dataCutoffAt: string | null;
  payload: WeeklyReportPayload | null;
  inputFingerprint: string | null;
  sourceManifest: SourceFreshnessManifest | null;
  /** Last readiness evaluation for this attempt -- see readiness.ts's ReadinessResult. Typed loosely here (not imported) to avoid a circular import between the two contract files; report-repo.ts's mapping layer is responsible for the real shape at the boundary. */
  readiness: unknown;
  previousSnapshotId: string | null;
  artifactKey: string | null;
  artifactChecksum: string | null;
  artifactSizeBytes: number | null;
  artifactContentType: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

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
  modules: Record<string, unknown>;
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
  | "forecast_scenarios";

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

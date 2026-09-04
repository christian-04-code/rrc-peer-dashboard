import type { Pool } from "pg";
import { isValidStorageWeekEnding, WEEKLY_REPORT_SCHEMA_VERSION } from "@/lib/reports/weekly-report-types";
import type {
  ComparisonResult,
  EvidenceModuleKey,
  SourceFreshnessManifest,
  WeeklyChange,
  WeeklyEvidenceItem,
  WeeklyReportModules,
  WeeklyReportPayload,
  WeeklyReportSnapshotRecord
} from "@/lib/reports/weekly-report-types";
import { evaluateReadiness, type ReadinessInputs, type ReadinessResult } from "@/lib/reports/readiness";
import { computeWeeklyChanges, flattenModules, isEvidenceItemChanged } from "@/lib/reports/changes";
import { computeWeeklyReportFingerprint } from "@/lib/reports/fingerprint";
import {
  createDraftSnapshot,
  freezeSnapshot,
  getActiveSnapshotForWeek,
  getPreviousPublishedSnapshot,
  getPublishedSnapshotForWeek,
  markSnapshotFailed,
  transitionToBuilding
} from "@/lib/reports/persistence/report-repo";
import { collectMacroEvidence, type MacroCollection } from "@/lib/reports/adapters/macro-adapter";
import { collectRigsEvidence } from "@/lib/reports/adapters/rigs-adapter";
import { collectRangeCompanyEvidence } from "@/lib/reports/adapters/range-company-adapter";
import { collectPeersEvidence } from "@/lib/reports/adapters/peers-adapter";
import { collectForecastEvidence } from "@/lib/reports/adapters/forecast-adapter";
import { collectNewsEvidence } from "@/lib/reports/adapters/news-adapter";

/**
 * Phase 7B snapshot builder -- the internal service boundary the phase
 * brief asks for (collectWeeklyIntelligenceInputs / buildWeeklyReportPayload
 * / computeWeeklyComparisons [done per-adapter, see comparisons.ts] /
 * computeWeeklyChanges [changes.ts] / evaluateReadiness [readiness.ts] /
 * computeWeeklyReportFingerprint [fingerprint.ts] / freezeWeeklySnapshot
 * [report-repo.ts]). This file is the ONLY place that composes all of
 * those into one run, and the only place in Phase 7B that writes to
 * weekly_report_snapshots. It stops at "ready" -- nothing here ever calls
 * publishSnapshot(), an AI provider, a chart renderer, or a PDF renderer,
 * and nothing here is reachable from any HTTP route (no
 * app/api/... file imports this module).
 */

export type CollectedWeeklyInputs = {
  macro: MacroCollection;
  rigs: ReturnType<typeof collectRigsEvidence>;
  rangeCompany: ReturnType<typeof collectRangeCompanyEvidence>;
  peers: ReturnType<typeof collectPeersEvidence>;
  forecast: ReturnType<typeof collectForecastEvidence>;
  news: Awaited<ReturnType<typeof collectNewsEvidence>>;
};

export type WeeklyDataCutoff = {
  /** The ONE cutoff timestamp established for this entire run (see runWeeklySnapshotBuild) -- never independently recomputed by an adapter. */
  dataCutoffAt: string;
  /** The previous PUBLISHED report's own frozen data_cutoff_at, or null for the very first report -- the News window's contiguous-boundary basis (see news-window.ts). */
  previousDataCutoffAt: string | null;
};

/**
 * Collects every subsystem's evidence for one candidate storage week.
 * Macro already ran (its live storage observation supplied the report's
 * own identity, Phase 7A decision #1, before this function is called) --
 * every adapter here is either synchronous or depends only on the already-
 * established `dataCutoffAt`, so they all run concurrently.
 */
export async function collectWeeklyIntelligenceInputs(pool: Pool | null, cutoff: WeeklyDataCutoff, now: Date = new Date()): Promise<Omit<CollectedWeeklyInputs, "macro">> {
  const [rigs, rangeCompany, peers, forecast, news] = await Promise.all([
    Promise.resolve(collectRigsEvidence(now)),
    Promise.resolve(collectRangeCompanyEvidence(now)),
    Promise.resolve(collectPeersEvidence()),
    Promise.resolve(collectForecastEvidence()),
    collectNewsEvidence(pool, cutoff.previousDataCutoffAt, cutoff.dataCutoffAt)
  ]);
  return { rigs, rangeCompany, peers, forecast, news };
}

function mergeModules(collected: CollectedWeeklyInputs): WeeklyReportModules {
  const merged: WeeklyReportModules = { ...collected.macro.modules };
  const addAll = (category: EvidenceModuleKey, items: WeeklyEvidenceItem[]) => {
    if (items.length === 0) return;
    merged[category] = [...(merged[category] ?? []), ...items];
  };
  addAll("rigs", collected.rigs.items);
  addAll("range_company", collected.rangeCompany.items);
  addAll("peers", collected.peers.items);
  addAll("forecast_scenarios", collected.forecast.items);
  addAll("news", collected.news.items);
  return merged;
}

export function buildSourceManifest(collected: CollectedWeeklyInputs): SourceFreshnessManifest {
  return {
    generatedFrom: [
      ...collected.macro.manifestEntries,
      ...collected.rigs.manifestEntries,
      ...collected.rangeCompany.manifestEntries,
      ...collected.peers.manifestEntries,
      ...collected.forecast.manifestEntries,
      ...collected.news.manifestEntries
    ]
  };
}

export function evaluateReportReadiness(collected: CollectedWeeklyInputs, sourceManifest: SourceFreshnessManifest): ReadinessResult {
  const inputs: ReadinessInputs = {
    eiaWeeklyStorageObservation: collected.macro.storageObservationPresent,
    macroFundamentalsSnapshot: collected.macro.fundamentalsSnapshotPresent,
    rangeMacroRiskEngineOutput: collected.macro.riskPayload.signals.length > 0,
    sourceFreshnessManifest: sourceManifest.generatedFrom.length > 0,
    peerComparisons: collected.peers.present,
    companyChanges: collected.rangeCompany.present,
    news: collected.news.present,
    steoRevisionHistory: collected.macro.steoRevisionHistoryPresent,
    otherForecastScenarios: collected.forecast.present
  };
  return evaluateReadiness(inputs);
}

function largestComparisonMagnitude(comparisons: ComparisonResult[]): number | null {
  const magnitudes = comparisons.map((c) => c.deltaPct).filter((v): v is number => v !== null).map(Math.abs);
  return magnitudes.length > 0 ? Math.max(...magnitudes) : null;
}

/**
 * The one place isNewThisWeek/changedSincePreviousReport/comparisonMagnitudePct
 * are actually filled in -- every adapter builds its items with these
 * defaulted to false/null (they have no access to the previous published
 * snapshot themselves), and this function makes the single cross-cutting
 * pass against it. Risk items (category "deterministic_risk_opportunity")
 * already carry a real riskSeverityRank/comparisonMagnitudePct from
 * macro-adapter.ts and are left untouched here except for the
 * new/changed flags, which still apply uniformly.
 *
 * `changedSincePreviousReport` uses `isEvidenceItemChanged()` (changes.ts)
 * -- the exact same semantic-equality rule `computeWeeklyChanges()` uses --
 * rather than a `displayValue` comparison, so this subsystem has exactly
 * one definition of "changed," not two that could silently disagree.
 */
export function annotateMateriality(modules: WeeklyReportModules, previousModules: WeeklyReportModules | null): WeeklyReportModules {
  const previous = previousModules ? flattenModules(previousModules) : new Map<string, WeeklyEvidenceItem>();
  const annotated: WeeklyReportModules = {};
  for (const [category, items] of Object.entries(modules) as [EvidenceModuleKey, WeeklyEvidenceItem[]][]) {
    annotated[category] = items.map((item) => {
      const prior = previous.get(item.evidenceId);
      const isNewThisWeek = !prior;
      const changedSincePreviousReport = Boolean(prior) && isEvidenceItemChanged(item, prior!);
      const comparisonMagnitudePct = item.materialityInputs.comparisonMagnitudePct ?? largestComparisonMagnitude(item.comparisons);
      return { ...item, materialityInputs: { ...item.materialityInputs, isNewThisWeek, changedSincePreviousReport, comparisonMagnitudePct } };
    });
  }
  return annotated;
}

export function buildWeeklyReportPayload(storageWeekEnding: string, dataCutoffAt: string, modules: WeeklyReportModules, sourceManifest: SourceFreshnessManifest): WeeklyReportPayload {
  return { schemaVersion: WEEKLY_REPORT_SCHEMA_VERSION, storageWeekEnding, dataCutoffAt, modules, sourceManifest };
}

export type WeeklySnapshotBuildResult =
  | { status: "no_valid_storage_period" }
  | { status: "already_published"; snapshot: WeeklyReportSnapshotRecord }
  | { status: "active_attempt_exists"; snapshot: WeeklyReportSnapshotRecord }
  | { status: "build_race_lost" }
  | { status: "failed"; snapshot: WeeklyReportSnapshotRecord; reason: string }
  | { status: "ready"; snapshot: WeeklyReportSnapshotRecord; changes: WeeklyChange[] };

/**
 * The full Phase 7B pipeline, through "ready" -- never further. Persistence
 * steps (Phase 7B brief's numbered list):
 *  1. identify current StorageWeekEnding (from Macro's live storage fetch)
 *  2. check whether already published for that week -> stop if so
 *  3. avoid a duplicate active attempt -> stop if one exists
 *  4. create a pending draft, linked to the previous published snapshot
 *  5. transition to building
 *  6. collect validated inputs (all subsystem adapters)
 *  7. build the source/freshness manifest
 *  8. evaluate readiness
 *  9. if required inputs are missing, fail the attempt with a specific reason
 *  10. build the canonical frozen payload
 *  11. compute the fingerprint
 *  12. freeze to "ready"
 * Never called from any browser-facing route -- there isn't one that
 * imports this module.
 *
 * Phase 7B.1: `dataCutoffAt` is established exactly ONCE here (from `now`,
 * this call's single wall-clock input), immediately after the previous
 * published snapshot is known -- and is the only "now" anything downstream
 * ever sees. It is a SNAPSHOT CUT-OFF (when this run froze its inputs), not
 * an observation date; each evidence item's own `period`/`asOfDate` (set by
 * its adapter from the real underlying data) are never overwritten with it.
 * The News adapter receives it explicitly (`cutoff.dataCutoffAt`) alongside
 * the previous published report's own frozen `dataCutoffAt`
 * (`cutoff.previousDataCutoffAt`) -- no adapter computes its own "now".
 */
export async function runWeeklySnapshotBuild(pool: Pool, now: Date = new Date()): Promise<WeeklySnapshotBuildResult> {
  const macro = await collectMacroEvidence(pool, now);
  const storageWeekEnding = macro.storageWeekEndingCandidate;

  if (!storageWeekEnding || !isValidStorageWeekEnding(storageWeekEnding)) {
    return { status: "no_valid_storage_period" };
  }

  const alreadyPublished = await getPublishedSnapshotForWeek(pool, storageWeekEnding);
  if (alreadyPublished) return { status: "already_published", snapshot: alreadyPublished };

  const activeAttempt = await getActiveSnapshotForWeek(pool, storageWeekEnding);
  if (activeAttempt) return { status: "active_attempt_exists", snapshot: activeAttempt };

  const previousSnapshot = await getPreviousPublishedSnapshot(pool, storageWeekEnding);
  const dataCutoffAt = now.toISOString();
  const cutoff: WeeklyDataCutoff = { dataCutoffAt, previousDataCutoffAt: previousSnapshot?.dataCutoffAt ?? null };

  const draft = await createDraftSnapshot(pool, { storageWeekEnding, schemaVersion: WEEKLY_REPORT_SCHEMA_VERSION, previousSnapshotId: previousSnapshot?.id ?? null });
  if (draft.status !== "pending") {
    // createDraftSnapshot returned an existing active row from a concurrent
    // caller that won the race between the check above and this call.
    return { status: "active_attempt_exists", snapshot: draft };
  }

  const building = await transitionToBuilding(pool, draft.id);
  if (!building) return { status: "build_race_lost" };

  const rest = await collectWeeklyIntelligenceInputs(pool, cutoff, now);
  const collected: CollectedWeeklyInputs = { macro, ...rest };

  const sourceManifest = buildSourceManifest(collected);
  const readiness = evaluateReportReadiness(collected, sourceManifest);

  if (!readiness.ready) {
    const reason = `Required input(s) missing: ${readiness.missingRequired.join(", ")}`;
    const failed = await markSnapshotFailed(pool, draft.id, reason);
    return { status: "failed", snapshot: failed ?? building, reason };
  }

  const rawModules = mergeModules(collected);
  const previousModules = previousSnapshot?.payload?.modules ?? null;
  const modules = annotateMateriality(rawModules, previousModules);

  const payload = buildWeeklyReportPayload(storageWeekEnding, dataCutoffAt, modules, sourceManifest);
  const fingerprint = computeWeeklyReportFingerprint({ schemaVersion: payload.schemaVersion, storageWeekEnding, modules });
  const changes = computeWeeklyChanges(modules, previousModules);

  const ready = await freezeSnapshot(pool, draft.id, { dataCutoffAt, payload, inputFingerprint: fingerprint, sourceManifest, readiness });
  if (!ready) return { status: "build_race_lost" };

  return { status: "ready", snapshot: ready, changes };
}

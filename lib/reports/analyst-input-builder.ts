import type { Pool } from "pg";
import type { WeeklyReportSnapshotRecord } from "@/lib/reports/weekly-report-types";
import type { WeeklyAnalystInput } from "@/lib/reports/ai-contract";
import { computeWeeklyChanges } from "@/lib/reports/changes";
import { selectAnalystEvidence } from "@/lib/reports/analyst-evidence-selection";
import { getPreviousPublishedSnapshot } from "@/lib/reports/persistence/report-repo";
import { getLatestAnalysisForSnapshot } from "@/lib/reports/persistence/analysis-repo";

/**
 * The one DB-touching step between a frozen snapshot and a bounded
 * WeeklyAnalystInput -- separated from analyst-evidence-selection.ts
 * (pure, DB-free) the same way Phase 7B's snapshot-builder.ts kept data
 * collection separate from pure transformation.
 *
 * WeeklyChange[] is not persisted anywhere (Phase 7B decision -- see
 * snapshot-builder.ts: it is a pure function of two payloads' modules), so
 * it is recomputed here from the snapshot's own frozen payload and the
 * previous *published* snapshot's payload -- deterministic and always
 * reproducible from already-persisted data, never re-derived differently
 * than runWeeklySnapshotBuild() itself would.
 */
export async function buildWeeklyAnalystInput(pool: Pool, snapshot: WeeklyReportSnapshotRecord): Promise<WeeklyAnalystInput> {
  if (!snapshot.payload) {
    throw new Error(`Cannot build a Weekly Analyst input for snapshot ${snapshot.id}: it has no frozen payload (status "${snapshot.status}", expected "ready" or later).`);
  }

  const previousSnapshot = await getPreviousPublishedSnapshot(pool, snapshot.storageWeekEnding);
  const previousModules = previousSnapshot?.payload?.modules ?? null;
  const changes = computeWeeklyChanges(snapshot.payload.modules, previousModules);

  let previousReportContext: WeeklyAnalystInput["previousReportContext"] = null;
  if (previousSnapshot) {
    const previousAnalysis = await getLatestAnalysisForSnapshot(pool, previousSnapshot.id);
    if (previousAnalysis && previousAnalysis.status === "ready" && previousAnalysis.assessment) {
      previousReportContext = { storageWeekEnding: previousSnapshot.storageWeekEnding, bottomLine: previousAnalysis.assessment.bottomLine };
    }
  }

  return selectAnalystEvidence(snapshot.payload, changes, previousReportContext);
}

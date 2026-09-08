import type { Pool } from "pg";
import { getSnapshotById, publishSnapshot } from "@/lib/reports/persistence/report-repo";
import { getReadyAnalysisForSnapshot } from "@/lib/reports/persistence/analysis-repo";
import { renderWeeklyReportPdf } from "@/lib/reports/render/weekly-report-pdf-service";
import type { PdfRenderer } from "@/lib/reports/render/pdf-renderer";
import type { ArtifactStorageProvider } from "@/lib/reports/render/artifact-store";
import type { WeeklyReportSnapshotRecord } from "@/lib/reports/weekly-report-types";

/**
 * Phase 7E's one entry point for turning a `ready` snapshot into a
 * `published` one: render -> store -> atomically transition. Mirrors the
 * exact shape Phase 7C's `generateWeeklyAnalysisIfNeeded()` and Phase 7B's
 * `runWeeklySnapshotBuild()` already established -- a plain, directly
 * callable, fully unit-testable function, injected with its own
 * PdfRenderer/ArtifactStorageProvider dependencies (fakes in tests, real
 * `ChromiumPdfRenderer`/`VercelBlobArtifactStore` for whoever calls it for
 * real). Nothing in this file schedules itself, is reachable from any
 * browser-facing route, or is called by anything yet -- deciding *when* to
 * publish (post-EIA-storage timing, readiness gating, the actual cron) is
 * explicitly Phase 7F's job, per that phase's own orchestration scope.
 *
 * Publication safety (the four gates, checked in order, each a hard
 * precondition before the next step runs):
 *   1. the snapshot exists and is in "ready" status (not pending/building/
 *      failed, and NOT already "published" -- see the early idempotent
 *      return below)
 *   2. a READY analyst assessment exists for this exact snapshot
 *      (getReadyAnalysisForSnapshot -- never a pending/failed one)
 *   3. renderWeeklyReportPdf() succeeds within the 5-page hard limit
 *      (Phase 7D's own retry-once-then-fail-safe policy)
 *   4. the rendered PDF uploads to artifact storage successfully
 * Only if all four succeed does publishSnapshot() ever get called -- and
 * that call is itself an atomic `UPDATE ... WHERE status = 'ready'`
 * (report-repo.ts), so a failure at any step above leaves the snapshot row
 * exactly as it was (still "ready", never "published"). Critically, this
 * function never touches any OTHER row: there is no "unpublish the
 * previous latest" step anywhere in this file, or anywhere in this
 * subsystem. `getLatestPublishedSnapshot()` (report-repo.ts) already
 * computes "latest" as MAX(storage_week_ending) WHERE status = 'published'
 * at query time, and the schema's own `weekly_report_snapshots_published_
 * week_key` partial unique index guarantees at most one published row per
 * week -- so a failed or in-progress publish attempt for a NEW week can
 * never affect, race with, or momentarily hide the previously published
 * report for an OLDER week. There is no unpublish-then-publish race to
 * avoid, because there is no unpublish step at all.
 */

export type PublishWeeklyReportResult =
  | { status: "published"; snapshot: WeeklyReportSnapshotRecord }
  | { status: "already_published"; snapshot: WeeklyReportSnapshotRecord }
  | { status: "not_found" }
  | { status: "not_ready"; reason: string }
  | { status: "render_failed"; reason: string }
  | { status: "storage_failed"; reason: string }
  | { status: "publish_race_lost" };

/** Known, safe-to-surface error types get their real (truncated) message; anything else is reduced to its error name only. Mirrors analyst-service.ts's safeErrorMessage. */
function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  return "Publication failed (unknown error).";
}

export async function publishWeeklyReportIfReady(
  pool: Pool,
  snapshotId: string,
  pdfRenderer: PdfRenderer,
  artifactStorage: ArtifactStorageProvider,
  logoDataUri: string | null
): Promise<PublishWeeklyReportResult> {
  const snapshot = await getSnapshotById(pool, snapshotId);
  if (!snapshot) return { status: "not_found" };

  // Idempotent: a second call for an already-published snapshot is a no-op
  // that neither re-renders nor re-uploads -- it just returns the same row.
  if (snapshot.status === "published") return { status: "already_published", snapshot };

  if (snapshot.status !== "ready" || !snapshot.payload) {
    return { status: "not_ready", reason: `Snapshot ${snapshotId} is "${snapshot.status}", not "ready" with a frozen payload.` };
  }

  const analysis = await getReadyAnalysisForSnapshot(pool, snapshotId);
  if (!analysis || !analysis.assessment) {
    return { status: "not_ready", reason: `No ready analyst assessment exists yet for snapshot ${snapshotId}.` };
  }

  let pdfResult;
  try {
    pdfResult = await renderWeeklyReportPdf(snapshot.payload, analysis.assessment, pdfRenderer, logoDataUri);
  } catch (error) {
    return { status: "render_failed", reason: safeErrorMessage(error) };
  }
  if (pdfResult.status === "failed") {
    return { status: "render_failed", reason: pdfResult.reason };
  }

  const artifactKey = `reports/weekly/${snapshot.storageWeekEnding}.pdf`;
  let putResult;
  try {
    putResult = await artifactStorage.put(artifactKey, pdfResult.pdf, "application/pdf");
  } catch (error) {
    return { status: "storage_failed", reason: safeErrorMessage(error) };
  }

  const published = await publishSnapshot(pool, snapshotId, {
    artifactKey: putResult.key,
    artifactChecksum: putResult.checksum,
    artifactSizeBytes: putResult.sizeBytes,
    artifactContentType: putResult.contentType
  });
  // publishSnapshot() returns null only if the row was no longer "ready" by
  // the time this UPDATE ran (a concurrent caller published or failed it
  // first) -- a lost race, not an error; the PDF was rendered and uploaded
  // for nothing, but no double-publish and no corrupted state resulted.
  if (!published) return { status: "publish_race_lost" };

  return { status: "published", snapshot: published };
}

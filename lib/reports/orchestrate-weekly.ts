import type { Pool } from "pg";
import { getPool, isDatabaseConfigured } from "@/lib/persistence/db";
import { runWeeklyReportMigrations } from "@/lib/reports/persistence/migrate";
import { runWeeklySnapshotBuild } from "@/lib/reports/snapshot-builder";
import { buildWeeklyAnalystInput } from "@/lib/reports/analyst-input-builder";
import { generateWeeklyAnalysisIfNeeded, computeWeeklyAnalystFingerprint } from "@/lib/reports/analyst-service";
import { WEEKLY_ANALYST_SCHEMA_VERSION } from "@/lib/reports/ai-contract";
import { WEEKLY_ANALYST_PROMPT_VERSION } from "@/lib/reports/ai/model-config";
import { AnthropicWeeklyAnalystProvider } from "@/lib/reports/ai/anthropic-provider";
import type { WeeklyAnalystProvider } from "@/lib/reports/ai/provider";
import { publishWeeklyReportIfReady } from "@/lib/reports/publish-service";
import { ChromiumPdfRenderer } from "@/lib/reports/render/pdf-renderer";
import type { PdfRenderer } from "@/lib/reports/render/pdf-renderer";
import { VercelBlobArtifactStore } from "@/lib/reports/render/artifact-store";
import type { ArtifactStorageProvider } from "@/lib/reports/render/artifact-store";
import { loadRrcLogoDataUri } from "@/lib/reports/render/branding";
import type { WeeklyReportSnapshotRecord } from "@/lib/reports/weekly-report-types";

/**
 * Phase 7F's one scheduled entry point -- the only place in this whole
 * subsystem that ever calls the real Anthropic provider or the real
 * ChromiumPdfRenderer/VercelBlobArtifactStore automatically. Every step
 * below is a thin call into an already-built, already-tested Phase 7
 * service (runWeeklySnapshotBuild, buildWeeklyAnalystInput,
 * generateWeeklyAnalysisIfNeeded, publishWeeklyReportIfReady) -- this file
 * adds ONLY the orchestration glue (locking, the data-driven safety-buffer
 * gate, and stage bookkeeping), never a second implementation of any of
 * their own logic.
 *
 * --- Concurrency: advisory lock, same established pattern ---
 * Reuses the exact `pg_try_advisory_lock(hashtext(...)::bigint)` pattern
 * lib/market/macro-orchestrate-daily.ts and lib/news/pipeline/orchestrate.ts
 * already use, under this subsystem's own lock key so a duplicate Weekly
 * Report cron delivery can never race a duplicate Macro or News delivery
 * (each has its own independent lock) or itself. The lock wraps the ENTIRE
 * function body -- not just the AI/render/publish tail -- so a concurrent
 * invocation is turned away before it can even start a second
 * runWeeklySnapshotBuild() attempt, per the brief's "do not rely only on
 * the final ready->published compare-and-swap" instruction. The DB's own
 * partial-unique-index-based idempotency (Phase 7A/7B) remains a second,
 * independent line of defense underneath this lock, unchanged.
 *
 * --- Readiness: fully reused, not reinvented ---
 * runWeeklySnapshotBuild() ALREADY implements requirements (1) a current
 * EIA storage observation exists, (3) required Macro/dashboard inputs are
 * present, (4) source/freshness requirements pass, and (6) no published
 * report already exists for that week -- see readiness.ts and
 * snapshot-builder.ts, both unchanged by this phase. This file adds
 * exactly ONE new check on top: requirement (5), the safety buffer.
 *
 * --- The safety buffer is DATA-DRIVEN, not wall-clock (Section: "not
 * brittle wall-clock dependence") ---
 * A snapshot's own `createdAt` timestamp already records, precisely and
 * durably, the moment THIS system first detected the current candidate
 * storage week and began building it (createDraftSnapshot() sets it once,
 * before any freshness/AI/render work happens, and it never changes
 * across pending -> building -> ready). The buffer gate is simply: "has at
 * least PUBLISH_SAFETY_BUFFER_MS elapsed since this snapshot's own
 * createdAt?" -- anchored to a real, observed, persisted event on OUR OWN
 * side, never to an assumed EIA release clock time or to Vercel's
 * imprecise cron firing time. Because this cron runs at most once a day
 * (Hobby's own limit), the buffer is almost always already satisfied by
 * the day AFTER a snapshot is first detected (roughly 24h > 1h) -- the
 * ONLY day it is ever unsatisfied is the very same run that first created
 * the snapshot, which correctly exits as "not_ready" and lets the next
 * day's run publish it. See the architecture doc's own section on the
 * chosen cron time for why this means a real Thursday EIA release
 * realistically publishes the following day, and why that is the correct,
 * documented trade-off for a Hobby-tier, non-minute-precise schedule.
 */

export const PUBLISH_SAFETY_BUFFER_MS = 60 * 60 * 1000; // 1 hour

const ORCHESTRATION_LOCK_QUERY = `SELECT pg_try_advisory_lock(hashtext('rrc_weekly_report_orchestration')::bigint) AS locked`;
const ORCHESTRATION_UNLOCK_QUERY = `SELECT pg_advisory_unlock(hashtext('rrc_weekly_report_orchestration')::bigint) AS unlocked`;

async function tryAcquireLock(pool: Pool): Promise<boolean> {
  try {
    const result = await pool.query(ORCHESTRATION_LOCK_QUERY);
    return result.rows[0]?.locked === true;
  } catch {
    return false;
  }
}

async function releaseLock(pool: Pool): Promise<void> {
  await pool.query(ORCHESTRATION_UNLOCK_QUERY).catch(() => undefined);
}

export type WeeklyReportOrchestrationStage = "not_ready" | "locked" | "already_published" | "failed" | "published";

export type WeeklyReportOrchestrationResult = {
  stage: WeeklyReportOrchestrationStage;
  reason?: string;
  storageWeekEnding?: string;
  snapshotId?: string;
  /** "built": frozen for the first time this run. "reused": an existing ready/published row from a prior run was found instead of building a new one. */
  snapshotStatus?: "built" | "reused" | "failed";
  analysisStatus?: "generated" | "cache_hit" | "failed" | "skipped_not_configured";
  publishStatus?: "published" | "already_published" | "render_failed" | "storage_failed" | "race_lost" | "skipped_not_configured";
  pageCount?: number;
};

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  return "Weekly report orchestration failed (unknown error).";
}

function bufferRemainingMs(snapshot: WeeklyReportSnapshotRecord, now: Date): number {
  const createdAtMs = new Date(snapshot.createdAt).getTime();
  const elapsed = now.getTime() - createdAtMs;
  return Math.max(0, PUBLISH_SAFETY_BUFFER_MS - elapsed);
}

export type OrchestrateWeeklyReportOptions = {
  now?: Date;
  /**
   * Injected in tests; production leaves all of these unset so real
   * implementations are constructed/called lazily, only once actually
   * needed. `buildSnapshot`/`buildAnalystInput` default to the real
   * `runWeeklySnapshotBuild`/`buildWeeklyAnalystInput` -- injectable
   * specifically because those two make REAL live EIA HTTP calls (Macro's
   * evidence collection is entirely live-fetched, confirmed in this
   * phase's own architecture-doc research) that must never run inside the
   * automated test suite. This keeps the orchestrator itself "thin" (it
   * still just calls the real service by default) while making every
   * branch of its own stage-sequencing logic testable against fakes.
   */
  buildSnapshot?: typeof runWeeklySnapshotBuild;
  buildAnalystInput?: typeof buildWeeklyAnalystInput;
  provider?: WeeklyAnalystProvider;
  pdfRenderer?: PdfRenderer;
  artifactStorage?: ArtifactStorageProvider;
  /**
   * A fake `Pool` (matching pg's own `.query()` shape) for tests -- also
   * lets a test bypass `isDatabaseConfigured()`/the real `getPool()`
   * singleton entirely, since injecting a pool is an explicit statement
   * the caller has already decided how connections work.
   */
  pool?: Pool;
  /** Defaults to the real `runWeeklyReportMigrations()`, which -- unlike every other dependency here -- always calls the real shared `getPool()` internally regardless of what `pool` above is; injectable specifically so tests can no-op it rather than hitting a real connection. */
  runMigrations?: () => Promise<void>;
};

export async function orchestrateWeeklyReport(options: OrchestrateWeeklyReportOptions = {}): Promise<WeeklyReportOrchestrationResult> {
  const now = options.now ?? new Date();

  let pool: Pool;
  if (options.pool) {
    pool = options.pool;
  } else {
    if (!isDatabaseConfigured()) {
      return { stage: "not_ready", reason: "Database not configured." };
    }
    pool = getPool();
  }

  const lockAcquired = await tryAcquireLock(pool);
  if (!lockAcquired) {
    return { stage: "locked", reason: "Another weekly report orchestration run is already in progress." };
  }

  try {
    const runMigrations = options.runMigrations ?? runWeeklyReportMigrations;
    await runMigrations();

    const buildSnapshot = options.buildSnapshot ?? runWeeklySnapshotBuild;
    const buildResult = await buildSnapshot(pool, now);

    let snapshot: WeeklyReportSnapshotRecord;
    let snapshotStatus: "built" | "reused";

    switch (buildResult.status) {
      case "no_valid_storage_period":
        return { stage: "not_ready", reason: "No valid EIA storage week-ending observation is available yet." };
      case "already_published":
        return { stage: "already_published", storageWeekEnding: buildResult.snapshot.storageWeekEnding, snapshotId: buildResult.snapshot.id };
      case "failed":
        // A real readiness failure (a required input -- storage/macro/
        // source-manifest -- was genuinely missing this run), not a
        // transient "not built yet" state; runWeeklySnapshotBuild() has
        // already durably recorded this as a "failed" row itself (Phase
        // 7A/7B's own audit trail, unchanged). Reported here as "not_ready"
        // rather than "failed" because, from THIS cron's perspective, it is
        // exactly the "new weekly inputs have not arrived/passed readiness
        // yet" case the brief asks to treat as a clean no-op -- a later
        // day's run building a fresh attempt (a new row; failed rows never
        // block a retry, per report-repo.ts) is the expected recovery path,
        // not a page-worthy pipeline failure.
        return { stage: "not_ready", reason: buildResult.reason };
      case "build_race_lost":
        // Should be rare given the advisory lock above already serializes
        // callers, but kept as a defensive second line of defense per the
        // brief's own instruction not to rely solely on either mechanism.
        return { stage: "locked", reason: "Lost a concurrent snapshot-build race." };
      case "active_attempt_exists": {
        if (buildResult.snapshot.status !== "ready") {
          // pending/building: another process's attempt is genuinely
          // mid-flight (should be exceedingly rare under the advisory lock,
          // e.g. a crashed prior run's row) -- clean no-op, never treated
          // as a failure of THIS run.
          return { stage: "locked", reason: `An active snapshot attempt for this week is still "${buildResult.snapshot.status}".` };
        }
        snapshot = buildResult.snapshot;
        snapshotStatus = "reused";
        break;
      }
      case "ready":
        snapshot = buildResult.snapshot;
        snapshotStatus = "built";
        break;
      default: {
        const exhaustive: never = buildResult;
        throw new Error(`Unhandled runWeeklySnapshotBuild status: ${JSON.stringify(exhaustive)}`);
      }
    }

    const remainingBufferMs = bufferRemainingMs(snapshot, now);
    if (remainingBufferMs > 0) {
      return {
        stage: "not_ready",
        reason: `Snapshot for week ${snapshot.storageWeekEnding} is ready but still inside its ${PUBLISH_SAFETY_BUFFER_MS / 60000}-minute safety buffer (${Math.ceil(remainingBufferMs / 60000)} minutes remaining).`,
        storageWeekEnding: snapshot.storageWeekEnding,
        snapshotId: snapshot.id,
        snapshotStatus
      };
    }

    if (!options.provider && !process.env.ANTHROPIC_API_KEY) {
      return {
        stage: "not_ready",
        reason: "ANTHROPIC_API_KEY is not configured -- analyst assessment generation skipped.",
        storageWeekEnding: snapshot.storageWeekEnding,
        snapshotId: snapshot.id,
        snapshotStatus,
        analysisStatus: "skipped_not_configured"
      };
    }
    if (!options.artifactStorage && !process.env.BLOB_READ_WRITE_TOKEN) {
      return {
        stage: "not_ready",
        reason: "BLOB_READ_WRITE_TOKEN is not configured -- artifact storage unavailable.",
        storageWeekEnding: snapshot.storageWeekEnding,
        snapshotId: snapshot.id,
        snapshotStatus,
        publishStatus: "skipped_not_configured"
      };
    }

    const provider = options.provider ?? new AnthropicWeeklyAnalystProvider();
    const buildAnalystInput = options.buildAnalystInput ?? buildWeeklyAnalystInput;
    const input = await buildAnalystInput(pool, snapshot);
    const analysisFingerprint = computeWeeklyAnalystFingerprint({
      snapshotFingerprint: snapshot.inputFingerprint ?? "",
      schemaVersion: WEEKLY_ANALYST_SCHEMA_VERSION,
      promptVersion: WEEKLY_ANALYST_PROMPT_VERSION,
      model: provider.modelName
    });

    let analysisResult;
    try {
      analysisResult = await generateWeeklyAnalysisIfNeeded(pool, provider, input, {
        snapshotId: snapshot.id,
        snapshotFingerprint: snapshot.inputFingerprint ?? "",
        schemaVersion: WEEKLY_ANALYST_SCHEMA_VERSION,
        model: provider.modelName,
        promptVersion: WEEKLY_ANALYST_PROMPT_VERSION
      });
    } catch (error) {
      return {
        stage: "failed",
        reason: safeErrorMessage(error),
        storageWeekEnding: snapshot.storageWeekEnding,
        snapshotId: snapshot.id,
        snapshotStatus,
        analysisStatus: "failed"
      };
    }
    // computeWeeklyAnalystFingerprint above is only used to keep this
    // route's own observability (not currently surfaced further) aligned
    // with generateWeeklyAnalysisIfNeeded's internal fingerprint -- the
    // service itself is the sole source of truth for cache-hit decisions.
    void analysisFingerprint;

    if (analysisResult.status === "in_progress") {
      return { stage: "locked", reason: "Another process is already generating this week's analyst assessment.", storageWeekEnding: snapshot.storageWeekEnding, snapshotId: snapshot.id, snapshotStatus };
    }
    if (analysisResult.status === "failed") {
      return {
        stage: "failed",
        reason: analysisResult.reason,
        storageWeekEnding: snapshot.storageWeekEnding,
        snapshotId: snapshot.id,
        snapshotStatus,
        analysisStatus: "failed"
      };
    }
    const analysisStatus = analysisResult.status === "cache_hit" ? "cache_hit" : "generated";

    const pdfRenderer = options.pdfRenderer ?? new ChromiumPdfRenderer();
    const artifactStorage = options.artifactStorage ?? new VercelBlobArtifactStore();
    const logoDataUri = loadRrcLogoDataUri();

    const publishResult = await publishWeeklyReportIfReady(pool, snapshot.id, pdfRenderer, artifactStorage, logoDataUri);

    switch (publishResult.status) {
      case "published":
        return {
          stage: "published",
          storageWeekEnding: publishResult.snapshot.storageWeekEnding,
          snapshotId: publishResult.snapshot.id,
          snapshotStatus,
          analysisStatus,
          publishStatus: "published"
        };
      case "already_published":
        return { stage: "already_published", storageWeekEnding: publishResult.snapshot.storageWeekEnding, snapshotId: publishResult.snapshot.id, snapshotStatus, analysisStatus, publishStatus: "already_published" };
      case "render_failed":
        return { stage: "failed", reason: publishResult.reason, storageWeekEnding: snapshot.storageWeekEnding, snapshotId: snapshot.id, snapshotStatus, analysisStatus, publishStatus: "render_failed" };
      case "storage_failed":
        return { stage: "failed", reason: publishResult.reason, storageWeekEnding: snapshot.storageWeekEnding, snapshotId: snapshot.id, snapshotStatus, analysisStatus, publishStatus: "storage_failed" };
      case "publish_race_lost":
        return { stage: "locked", reason: "Lost a concurrent publish race.", storageWeekEnding: snapshot.storageWeekEnding, snapshotId: snapshot.id, snapshotStatus, analysisStatus, publishStatus: "race_lost" };
      case "not_found":
      case "not_ready":
        // Should be unreachable here (this same run already confirmed the
        // snapshot is "ready" with a "ready" assessment moments ago), but
        // handled explicitly rather than assumed away.
        return { stage: "failed", reason: "Publish preconditions unexpectedly not met.", storageWeekEnding: snapshot.storageWeekEnding, snapshotId: snapshot.id, snapshotStatus, analysisStatus };
      default: {
        const exhaustive: never = publishResult;
        throw new Error(`Unhandled publishWeeklyReportIfReady status: ${JSON.stringify(exhaustive)}`);
      }
    }
  } catch (error) {
    return { stage: "failed", reason: safeErrorMessage(error) };
  } finally {
    await releaseLock(pool);
  }
}

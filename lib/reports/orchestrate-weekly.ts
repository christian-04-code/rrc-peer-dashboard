import type { Pool } from "pg";
import { getPool, isDatabaseConfigured } from "@/lib/persistence/db";
import { runWeeklyReportMigrations } from "@/lib/reports/persistence/migrate";
import { runWeeklySnapshotBuild } from "@/lib/reports/snapshot-builder";
import { collectMacroEvidence } from "@/lib/reports/adapters/macro-adapter";
import { isValidStorageWeekEnding } from "@/lib/reports/weekly-report-types";
import { getPublishedSnapshotForWeek } from "@/lib/reports/persistence/report-repo";
import { recordStorageObservationFirstSeen } from "@/lib/reports/persistence/storage-observation-repo";
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
 * --- The safety buffer is DATA-DRIVEN, not wall-clock, AND checked BEFORE
 * the snapshot is built/frozen (Section: "not brittle wall-clock
 * dependence") ---
 * A prior version of this file anchored the buffer to
 * `weekly_report_snapshots.created_at` and checked it AFTER
 * `runWeeklySnapshotBuild()` had already collected every subsystem's
 * evidence and frozen the payload. That was wrong: `created_at` is set by
 * OUR OWN build attempt, not by the underlying data event, and freezing
 * before checking the buffer meant the buffer always read "just built" on
 * the very run that first detected a new week -- guaranteeing a needless
 * extra day's delay on a once-daily Hobby cron even when the real EIA data
 * was already safely more than an hour old by the time the cron ran.
 *
 * The corrected sequence, matching the intended product semantics exactly:
 * detect the current candidate storage week (a cheap live-EIA peek, via
 * `detectStorageCandidate`) -> record/read this candidate's own
 * `first_observed_at` in `weekly_report_storage_observations` (a tiny,
 * dedicated, append-only ledger -- see storage-observation-repo.ts for why
 * this is a NEW durable timestamp rather than a reuse of any existing
 * field: no existing persisted timestamp represents "when this specific
 * storage observation became available," since Macro's storage/production/
 * demand metrics are deliberately entirely live-fetched with no Neon
 * cache) -> only once at least `PUBLISH_SAFETY_BUFFER_MS` has elapsed since
 * that FIRST observation does this file call `buildSnapshot()` at all. A
 * week still inside its buffer never reaches `runWeeklySnapshotBuild()`,
 * so no draft/pending/building/frozen row is ever created prematurely for
 * it. Because this cron runs at most once a day (Hobby's own limit), a
 * storage week whose data has already been live for over an hour by the
 * time a given day's cron runs (the common case, since EIA's typical
 * Thursday release time is hours before this subsystem's own 17:00 UTC
 * schedule -- see the architecture doc) can build and publish on that SAME
 * run, not merely "the day after." The buffer still guarantees at least
 * one real hour has elapsed since first observation before any AI/render/
 * publish work happens, exactly as required.
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

function bufferRemainingMs(firstObservedAtIso: string, now: Date): number {
  const firstObservedAtMs = new Date(firstObservedAtIso).getTime();
  const elapsed = now.getTime() - firstObservedAtMs;
  return Math.max(0, PUBLISH_SAFETY_BUFFER_MS - elapsed);
}

export type StorageCandidateDetectionResult = {
  /** The current EIA storage week-ending candidate, or null if none is available yet (mirrors runWeeklySnapshotBuild()'s own "no_valid_storage_period" check -- deliberately re-evaluated here via the same live Macro fetch, not cached, so a stale/missing observation is never mistaken for a fresh one). */
  storageWeekEnding: string | null;
};

/**
 * The default, real implementation of `detectStorageCandidate`: a live
 * Macro/EIA peek, reusing the exact same `collectMacroEvidence()` +
 * `isValidStorageWeekEnding()` logic `runWeeklySnapshotBuild()` itself uses
 * to establish the report's own identity (snapshot-builder.ts) -- never a
 * second, divergent implementation of "what counts as a valid current
 * storage week." This does mean a full run that clears the buffer performs
 * two live Macro fetches (one here, one inside `runWeeklySnapshotBuild()`
 * moments later) -- an accepted, deliberately small inefficiency: this
 * cron runs at most once a day, and every Macro/EIA fetch in this
 * subsystem is already documented as safe to repeat (see the architecture
 * doc's own research into `refreshSteoSnapshots()`'s idempotent-by-month
 * upsert). Injectable specifically so tests never make a real live EIA
 * call.
 */
async function detectStorageCandidateReal(pool: Pool, now: Date): Promise<StorageCandidateDetectionResult> {
  const macro = await collectMacroEvidence(pool, now);
  const candidate = macro.storageWeekEndingCandidate;
  if (!macro.storageObservationPresent || !candidate || !isValidStorageWeekEnding(candidate)) {
    return { storageWeekEnding: null };
  }
  return { storageWeekEnding: candidate };
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
  /** Defaults to `detectStorageCandidateReal` (a live Macro/EIA peek) -- injectable so tests can simulate a candidate week (or its absence) without a real EIA HTTP call, independent of whatever `buildSnapshot` fake is also injected. */
  detectStorageCandidate?: (pool: Pool, now: Date) => Promise<StorageCandidateDetectionResult>;
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

    // --- Safety-buffer gate, BEFORE any snapshot build/freeze work ---
    const detectStorageCandidate = options.detectStorageCandidate ?? detectStorageCandidateReal;
    const { storageWeekEnding: candidateWeek } = await detectStorageCandidate(pool, now);

    if (!candidateWeek) {
      return { stage: "not_ready", reason: "No valid EIA storage week-ending observation is available yet." };
    }

    const alreadyPublishedForCandidate = await getPublishedSnapshotForWeek(pool, candidateWeek);
    if (alreadyPublishedForCandidate) {
      return { stage: "already_published", storageWeekEnding: alreadyPublishedForCandidate.storageWeekEnding, snapshotId: alreadyPublishedForCandidate.id };
    }

    const observation = await recordStorageObservationFirstSeen(pool, candidateWeek);
    const remainingBufferMs = bufferRemainingMs(observation.firstObservedAt, now);
    if (remainingBufferMs > 0) {
      return {
        stage: "not_ready",
        reason: `Storage week ${candidateWeek}'s observation was first confirmed at ${observation.firstObservedAt} and is still inside its ${PUBLISH_SAFETY_BUFFER_MS / 60000}-minute safety buffer (${Math.ceil(remainingBufferMs / 60000)} minutes remaining) -- no snapshot build has been attempted.`,
        storageWeekEnding: candidateWeek
      };
    }

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

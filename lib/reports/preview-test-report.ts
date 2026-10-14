import { createHash, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import type { WeeklyAnalystAssessment, WeeklyAnalystInput } from "@/lib/reports/ai-contract";
import type { WeeklyAnalystProvider } from "@/lib/reports/ai/provider";
import { collectMacroEvidence } from "@/lib/reports/adapters/macro-adapter";
import { annotateMateriality, buildSourceManifest, buildWeeklyReportPayload, collectWeeklyIntelligenceInputs, evaluateReportReadiness, mergeChartSeries, mergeModules, type CollectedWeeklyInputs } from "@/lib/reports/snapshot-builder";
import { computeWeeklyChanges } from "@/lib/reports/changes";
import { selectAnalystEvidence } from "@/lib/reports/analyst-evidence-selection";
import { getPreviousPublishedSnapshot } from "@/lib/reports/persistence/report-repo";
import { getLatestAnalysisForSnapshot } from "@/lib/reports/persistence/analysis-repo";
import { withBoundedRetry, DEFAULT_ANALYSIS_RETRY_CONFIG } from "@/lib/news/ai/retry";
import { renderWeeklyReportPdf } from "@/lib/reports/render/weekly-report-pdf-service";
import type { PdfRenderer } from "@/lib/reports/render/pdf-renderer";
import type { WeeklyReportRenderModel } from "@/lib/reports/render/render-model";
import { isValidStorageWeekEnding, type WeeklyReportPayload } from "@/lib/reports/weekly-report-types";

/**
 * Preview-only, NON-PUBLISHING weekly report test run (2026-10-13).
 *
 * Exists because Preview and Production share one Postgres database and one
 * Blob store, so the real cron path (orchestrate-weekly.ts) cannot be
 * exercised on a Preview without publishing into production's "latest
 * report". This module runs the same pipeline stages in memory instead:
 * live adapters -> frozen-shape payload -> deterministic change set ->
 * real AI analysis -> real PDF render -- and returns the result to the
 * caller. It persists nothing:
 *  - it never imports a snapshot/analysis WRITE function, publish-service,
 *    artifact-store, @vercel/blob, or orchestrate-weekly (enforced by a
 *    static test, tests/weekly-report-preview-test-route.test.cjs);
 *  - the only DB connection it uses is a dedicated pool whose sessions are
 *    forced into Postgres read-only mode, verified before any work starts
 *    (assertReadOnly). Even the macro adapter's best-effort STEO refresh
 *    write is rejected by the database itself and swallowed by that
 *    adapter's own existing try/catch, exactly as it already handles any
 *    refresh failure.
 */

export const PREVIEW_TEST_SECRET_ENV = "REPORT_PREVIEW_TEST_SECRET";
const MIN_SECRET_LENGTH = 32;

/**
 * True only on a Vercel Preview deployment with a long-enough dedicated
 * secret configured and an exactly matching `Authorization: Bearer` header.
 * Digest-then-timingSafeEqual so neither the comparison time nor a length
 * mismatch leaks anything about the secret.
 */
export function isPreviewTestRequestAuthorized(env: Record<string, string | undefined>, authorizationHeader: string | null): boolean {
  if (env.VERCEL_ENV !== "preview") return false;
  if (env.VERCEL_TARGET_ENV === "production") return false;
  const secret = env[PREVIEW_TEST_SECRET_ENV];
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false;
  if (!authorizationHeader?.startsWith("Bearer ")) return false;
  const supplied = createHash("sha256").update(authorizationHeader.slice("Bearer ".length)).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(supplied, expected);
}

function readOnlyDatabaseUrl(env: Record<string, string | undefined>): string | undefined {
  // The direct (non-pooled) endpoint: session-level settings are only
  // reliable on a real session, not through a transaction-mode pooler.
  return env.POSTGRES_URL_NON_POOLING?.trim() || env.POSTGRES_DATABASE_URL_UNPOOLED?.trim() || undefined;
}

/** A dedicated pool (never the app's shared getPool()) whose every session defaults to read-only transactions. */
export function createReadOnlyPool(env: Record<string, string | undefined>): Pool | null {
  const connectionString = readOnlyDatabaseUrl(env);
  if (!connectionString) return null;
  // max: 1 -- the single session assertReadOnly() verifies is the only session ever used.
  // idleTimeoutMillis: 0 -- never drop and silently replace that verified session mid-run.
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1, idleTimeoutMillis: 0 });
  pool.on("connect", (client) => {
    client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY").catch(() => undefined);
  });
  return pool;
}

export class PreviewTestSafetyError extends Error {}

/** Refuses to continue unless Postgres itself reports the session as read-only. */
export async function assertReadOnly(pool: Pool): Promise<void> {
  const result = await pool.query<{ transaction_read_only: string }>("SHOW transaction_read_only");
  if (result.rows[0]?.transaction_read_only !== "on") {
    throw new PreviewTestSafetyError("Database session is not read-only; refusing to run the preview test report.");
  }
}

export type PreviewTestReportResult =
  | {
      status: "rendered";
      storageWeekEnding: string;
      dataCutoffAt: string;
      previousPublishedWeek: string | null;
      changeCount: number;
      aiProvider: string;
      aiModel: string;
      pageCount: number;
      reducedContent: boolean;
      payload: WeeklyReportPayload;
      analystInput: WeeklyAnalystInput;
      assessment: WeeklyAnalystAssessment;
      renderModel: WeeklyReportRenderModel;
      pdf: Buffer;
    }
  | { status: "not_ready"; stage: string; reason: string };

export async function runPreviewTestReport(deps: {
  pool: Pool;
  provider: WeeklyAnalystProvider;
  pdfRenderer: PdfRenderer;
  logoDataUri: string | null;
  now?: Date;
}): Promise<PreviewTestReportResult> {
  const now = deps.now ?? new Date();
  await assertReadOnly(deps.pool);

  const macro = await collectMacroEvidence(deps.pool, now);
  const storageWeekEnding = macro.storageWeekEndingCandidate;
  if (!storageWeekEnding || !isValidStorageWeekEnding(storageWeekEnding)) {
    return { status: "not_ready", stage: "storage_week", reason: "No valid EIA storage week available." };
  }

  // Same "previous published report" production uses for this week -- read only.
  const previous = await getPreviousPublishedSnapshot(deps.pool, storageWeekEnding);
  const dataCutoffAt = now.toISOString();
  const rest = await collectWeeklyIntelligenceInputs(deps.pool, { dataCutoffAt, previousDataCutoffAt: previous?.dataCutoffAt ?? null }, now);
  const collected: CollectedWeeklyInputs = { macro, ...rest };

  const sourceManifest = buildSourceManifest(collected);
  const readiness = evaluateReportReadiness(collected, sourceManifest);
  if (!readiness.ready) {
    return { status: "not_ready", stage: "readiness", reason: `Required input(s) missing: ${readiness.missingRequired.join(", ")}` };
  }

  const previousModules = previous?.payload?.modules ?? null;
  const modules = annotateMateriality(mergeModules(collected), previousModules);
  const payload = buildWeeklyReportPayload(storageWeekEnding, dataCutoffAt, modules, sourceManifest, mergeChartSeries(collected));
  const changes = computeWeeklyChanges(modules, previousModules);

  let previousReportContext: WeeklyAnalystInput["previousReportContext"] = null;
  if (previous) {
    const previousAnalysis = await getLatestAnalysisForSnapshot(deps.pool, previous.id);
    if (previousAnalysis?.status === "ready" && previousAnalysis.assessment) {
      previousReportContext = { storageWeekEnding: previous.storageWeekEnding, bottomLine: previousAnalysis.assessment.bottomLine };
    }
  }

  const analystInput = selectAnalystEvidence(payload, changes, previousReportContext);
  const assessment = await withBoundedRetry(() => deps.provider.analyze(analystInput), DEFAULT_ANALYSIS_RETRY_CONFIG);

  const rendered = await renderWeeklyReportPdf(payload, assessment, deps.pdfRenderer, deps.logoDataUri);
  if (rendered.status !== "rendered") {
    return { status: "not_ready", stage: "pdf", reason: rendered.reason };
  }

  return {
    status: "rendered",
    storageWeekEnding,
    dataCutoffAt,
    previousPublishedWeek: previous?.storageWeekEnding ?? null,
    changeCount: changes.length,
    aiProvider: assessment.aiProvider,
    aiModel: assessment.aiModel,
    pageCount: rendered.pageCount,
    reducedContent: rendered.reducedContent,
    payload,
    analystInput,
    assessment,
    renderModel: rendered.renderModel,
    pdf: rendered.pdf
  };
}

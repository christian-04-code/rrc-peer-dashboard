import { createHash, timingSafeEqual } from "node:crypto";
import { Client, Pool } from "pg";
import { WeeklyAnalystValidationError, type WeeklyAnalystAssessment, type WeeklyAnalystInput } from "@/lib/reports/ai-contract";
import type { WeeklyAnalystProvider } from "@/lib/reports/ai/provider";
import { collectMacroEvidence } from "@/lib/reports/adapters/macro-adapter";
import { annotateMateriality, buildSourceManifest, buildWeeklyReportPayload, collectWeeklyIntelligenceInputs, evaluateReportReadiness, mergeChartSeries, mergeModules, type CollectedWeeklyInputs } from "@/lib/reports/snapshot-builder";
import { computeWeeklyChanges } from "@/lib/reports/changes";
import { selectAnalystEvidence } from "@/lib/reports/analyst-evidence-selection";
import { getPreviousPublishedSnapshot } from "@/lib/reports/persistence/report-repo";
import { getLatestAnalysisForSnapshot } from "@/lib/reports/persistence/analysis-repo";
import { DEFAULT_ANALYSIS_RETRY_CONFIG } from "@/lib/news/ai/retry";
import type { WeeklyAnalystResponseMeta } from "@/lib/reports/ai/anthropic-provider";
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

export const READ_ONLY_SESSION_SQL = "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY";

/**
 * A pg Client whose connect() only resolves AFTER its session has been switched to
 * read-only. pg's Pool awaits connect() before handing a client to any caller, so the
 * SET always runs first, alone on the connection -- no query is ever issued on a
 * session that isn't read-only yet, and (unlike a fire-and-forget `pool.on("connect")`
 * SET) a failed SET fails the connection instead of being silently ignored. Applies to
 * every session the pool ever opens, including a reconnect.
 */
export class ReadOnlyClient extends Client {
  // Pool calls connect(callback); direct callers may use the promise form. Both supported.
  connect(): Promise<Client>;
  connect(callback: ((err: Error) => void) | ((err: null, c: Client) => void)): void;
  connect(callback?: ((err: Error) => void) | ((err: null, c: Client) => void)): Promise<Client> | void {
    const ready: Promise<Client> = super.connect().then(() => super.query(READ_ONLY_SESSION_SQL)).then(() => this);
    if (!callback) return ready;
    const cb = callback as (err: Error | null, c?: Client) => void;
    ready.then((client) => cb(null, client), (err: Error) => cb(err));
  }
}

/** A dedicated pool (never the app's shared getPool()) whose every session is read-only before first use. */
export function createReadOnlyPool(env: Record<string, string | undefined>): Pool | null {
  const connectionString = readOnlyDatabaseUrl(env);
  if (!connectionString) return null;
  // max: 1 -- the single session assertReadOnly() verifies is the only session ever used.
  // idleTimeoutMillis: 0 -- never drop and silently replace that verified session mid-run.
  return new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1, idleTimeoutMillis: 0, Client: ReadOnlyClient });
}

export class PreviewTestSafetyError extends Error {}

/** Refuses to continue unless Postgres itself reports the session as read-only. */
export async function assertReadOnly(pool: Pool): Promise<void> {
  const result = await pool.query<{ transaction_read_only: string }>("SHOW transaction_read_only");
  if (result.rows[0]?.transaction_read_only !== "on") {
    throw new PreviewTestSafetyError("Database session is not read-only; refusing to run the preview test report.");
  }
}

export type PreviewTestStage = "read_only_check" | "data_collection" | "ai_generation" | "ai_validation" | "pdf_render";

/** One AI attempt's outcome -- metadata and our own validator's reason only, never prompt or response text. */
export type AiAttemptDiagnostic = {
  attempt: number;
  outcome: "ok" | "failed";
  stage: "ai_generation" | "ai_validation" | null;
  errorClass: string | null;
  message: string | null;
  httpStatus: number | null;
  timedOut: boolean;
  truncated: boolean;
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  maxOutputTokens: number | null;
  durationMs: number;
};

export type PreviewTestDiagnostics = {
  timingsMs: Partial<Record<PreviewTestStage, number>>;
  aiAttempts: AiAttemptDiagnostic[];
};

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
      diagnostics: PreviewTestDiagnostics;
    }
  | { status: "not_ready"; stage: PreviewTestStage; reason: string; diagnostics: PreviewTestDiagnostics }
  | { status: "failed"; stage: PreviewTestStage; error: { errorClass: string; message: string }; diagnostics: PreviewTestDiagnostics };

const MAX_DIAGNOSTIC_MESSAGE_CHARS = 400;

/**
 * Strips anything credential-shaped from an error message before it is logged or
 * returned: connection URLs, Anthropic keys, bearer tokens, and any long opaque
 * token-like run (secrets, hashes). Then truncates. Messages from our own validator
 * (field names, char/word counts, evidence ids) pass through readable.
 */
export function sanitizeDiagnosticMessage(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : String(raw);
  return text
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, "[url]")
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[key]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_+/=-]{32,}/g, "[redacted]")
    .slice(0, MAX_DIAGNOSTIC_MESSAGE_CHARS);
}

/** Every custom error here extends Error without setting `name`, so the constructor name is the only reliable class label. */
export function errorClassOf(error: unknown): string {
  if (error instanceof Error) return error.constructor?.name && error.constructor.name !== "Error" ? error.constructor.name : error.name;
  return typeof error;
}

function httpStatusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

function isTimeout(error: unknown): boolean {
  const cls = errorClassOf(error);
  return /timeout/i.test(cls) || /timed? ?out/i.test(error instanceof Error ? error.message : "");
}

/** Same attempt count / backoff as production's DEFAULT_ANALYSIS_RETRY_CONFIG -- only the bookkeeping differs. */
const AI_MAX_ATTEMPTS = DEFAULT_ANALYSIS_RETRY_CONFIG.maxAttempts;
const AI_BASE_DELAY_MS = DEFAULT_ANALYSIS_RETRY_CONFIG.baseDelayMs;
/** Leave room for an AI attempt (~60s observed upper range) plus the PDF render before Vercel's 300s function limit. */
const MIN_MS_REMAINING_FOR_AI_ATTEMPT = 90_000;

export async function runPreviewTestReport(deps: {
  pool: Pool;
  /** Receives a metadata callback so each attempt's stop reason / token usage can be recorded. */
  createProvider: (onResponseMeta: (meta: WeeklyAnalystResponseMeta) => void) => WeeklyAnalystProvider;
  pdfRenderer: PdfRenderer;
  logoDataUri: string | null;
  now?: Date;
  /** Epoch ms after which no new AI attempt is started (defaults to now + 280s). */
  deadlineMs?: number;
}): Promise<PreviewTestReportResult> {
  const now = deps.now ?? new Date();
  const deadlineMs = deps.deadlineMs ?? Date.now() + 280_000;
  const diagnostics: PreviewTestDiagnostics = { timingsMs: {}, aiAttempts: [] };
  let stage: PreviewTestStage = "read_only_check";
  const timed = async <T>(name: PreviewTestStage, fn: () => Promise<T>): Promise<T> => {
    stage = name;
    const started = Date.now();
    try {
      return await fn();
    } finally {
      diagnostics.timingsMs[name] = (diagnostics.timingsMs[name] ?? 0) + (Date.now() - started);
    }
  };
  const fail = (failedStage: PreviewTestStage, error: unknown): PreviewTestReportResult => ({
    status: "failed",
    stage: failedStage,
    error: { errorClass: errorClassOf(error), message: sanitizeDiagnosticMessage(error) },
    diagnostics
  });

  try {
    await timed("read_only_check", () => assertReadOnly(deps.pool));

    const collected = await timed("data_collection", async () => {
      const macro = await collectMacroEvidence(deps.pool, now);
      const storageWeekEnding = macro.storageWeekEndingCandidate;
      if (!storageWeekEnding || !isValidStorageWeekEnding(storageWeekEnding)) return { notReady: "No valid EIA storage week available." } as const;
      // Same "previous published report" production uses for this week -- read only.
      const previous = await getPreviousPublishedSnapshot(deps.pool, storageWeekEnding);
      const dataCutoffAt = now.toISOString();
      const rest = await collectWeeklyIntelligenceInputs(deps.pool, { dataCutoffAt, previousDataCutoffAt: previous?.dataCutoffAt ?? null }, now);
      const inputs: CollectedWeeklyInputs = { macro, ...rest };
      const sourceManifest = buildSourceManifest(inputs);
      const readiness = evaluateReportReadiness(inputs, sourceManifest);
      if (!readiness.ready) return { notReady: `Required input(s) missing: ${readiness.missingRequired.join(", ")}` } as const;

      const previousModules = previous?.payload?.modules ?? null;
      const modules = annotateMateriality(mergeModules(inputs), previousModules);
      const payload = buildWeeklyReportPayload(storageWeekEnding, dataCutoffAt, modules, sourceManifest, mergeChartSeries(inputs));
      const changes = computeWeeklyChanges(modules, previousModules);
      let previousReportContext: WeeklyAnalystInput["previousReportContext"] = null;
      if (previous) {
        const previousAnalysis = await getLatestAnalysisForSnapshot(deps.pool, previous.id);
        if (previousAnalysis?.status === "ready" && previousAnalysis.assessment) {
          previousReportContext = { storageWeekEnding: previous.storageWeekEnding, bottomLine: previousAnalysis.assessment.bottomLine };
        }
      }
      return { storageWeekEnding, dataCutoffAt, previous, payload, changes, analystInput: selectAnalystEvidence(payload, changes, previousReportContext) };
    });
    if ("notReady" in collected && typeof collected.notReady === "string") return { status: "not_ready", stage: "data_collection", reason: collected.notReady, diagnostics };
    if (!("analystInput" in collected)) return { status: "not_ready", stage: "data_collection", reason: "Data collection returned no analyst input.", diagnostics };

    // AI: production's attempt count/backoff, with each attempt classified as a
    // generation failure (API error, timeout, truncation) or a validation failure.
    let lastMeta: WeeklyAnalystResponseMeta | null = null;
    stage = "ai_generation"; // a provider that can't even be constructed (e.g. missing key) is a generation failure
    const provider = deps.createProvider((meta) => {
      lastMeta = meta;
    });
    let assessment: WeeklyAnalystAssessment | null = null;
    let lastError: unknown = null;
    let lastFailedStage: PreviewTestStage = "ai_generation";
    for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS && !assessment; attempt += 1) {
      if (deadlineMs - Date.now() < MIN_MS_REMAINING_FOR_AI_ATTEMPT) {
        lastError = new Error(`Time budget: fewer than ${MIN_MS_REMAINING_FOR_AI_ATTEMPT / 1000}s left before the function limit; attempt ${attempt} not started.`);
        lastFailedStage = "ai_generation";
        break;
      }
      lastMeta = null;
      const started = Date.now();
      try {
        assessment = await timed("ai_generation", () => provider.analyze(collected.analystInput));
        const meta = lastMeta as WeeklyAnalystResponseMeta | null;
        diagnostics.aiAttempts.push({ attempt, outcome: "ok", stage: null, errorClass: null, message: null, httpStatus: null, timedOut: false, truncated: false, stopReason: meta?.stopReason ?? null, inputTokens: meta?.inputTokens ?? null, outputTokens: meta?.outputTokens ?? null, maxOutputTokens: meta?.maxOutputTokens ?? null, durationMs: Date.now() - started });
      } catch (error) {
        const meta = lastMeta as WeeklyAnalystResponseMeta | null;
        const failedStage: "ai_generation" | "ai_validation" = error instanceof WeeklyAnalystValidationError ? "ai_validation" : "ai_generation";
        const truncated = meta?.stopReason === "max_tokens" || /max_tokens/.test(error instanceof Error ? error.message : "");
        diagnostics.aiAttempts.push({ attempt, outcome: "failed", stage: failedStage, errorClass: errorClassOf(error), message: sanitizeDiagnosticMessage(error), httpStatus: httpStatusOf(error), timedOut: isTimeout(error), truncated, stopReason: meta?.stopReason ?? null, inputTokens: meta?.inputTokens ?? null, outputTokens: meta?.outputTokens ?? null, maxOutputTokens: meta?.maxOutputTokens ?? null, durationMs: Date.now() - started });
        lastError = error;
        lastFailedStage = failedStage;
        if (attempt < AI_MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, AI_BASE_DELAY_MS * attempt));
      }
    }
    if (!assessment) return fail(lastFailedStage, lastError);
    const finalAssessment: WeeklyAnalystAssessment = assessment;

    const rendered = await timed("pdf_render", () => renderWeeklyReportPdf(collected.payload, finalAssessment, deps.pdfRenderer, deps.logoDataUri));
    if (rendered.status !== "rendered") return { status: "not_ready", stage: "pdf_render", reason: rendered.reason, diagnostics };

    return {
      status: "rendered",
      storageWeekEnding: collected.storageWeekEnding,
      dataCutoffAt: collected.dataCutoffAt,
      previousPublishedWeek: collected.previous?.storageWeekEnding ?? null,
      changeCount: collected.changes.length,
      aiProvider: finalAssessment.aiProvider,
      aiModel: finalAssessment.aiModel,
      pageCount: rendered.pageCount,
      reducedContent: rendered.reducedContent,
      payload: collected.payload,
      analystInput: collected.analystInput,
      assessment: finalAssessment,
      renderModel: rendered.renderModel,
      pdf: rendered.pdf,
      diagnostics
    };
  } catch (error) {
    return fail(stage, error);
  }
}

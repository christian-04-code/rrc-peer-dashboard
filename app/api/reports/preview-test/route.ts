import { NextResponse } from "next/server";
import { AnthropicWeeklyAnalystProvider } from "@/lib/reports/ai/anthropic-provider";
import { ChromiumPdfRenderer } from "@/lib/reports/render/pdf-renderer";
import { loadRrcLogoDataUri } from "@/lib/reports/render/branding";
import { createReadOnlyPool, errorClassOf, isPreviewTestRequestAuthorized, runPreviewTestReport, sanitizeDiagnosticMessage } from "@/lib/reports/preview-test-report";

/**
 * Preview-only, non-publishing weekly report test run -- see
 * lib/reports/preview-test-report.ts for the full safety design. Responds
 * 404 (indistinguishable from a missing route) unless this is a Vercel
 * Preview deployment AND the request carries the dedicated
 * REPORT_PREVIEW_TEST_SECRET as a Bearer token. POST only, so no crawler,
 * link prefetch, or Vercel cron can trigger it.
 *
 * Returns JSON: run metadata, per-stage timings and per-AI-attempt
 * diagnostics, the frozen-shape payload, the exact AI input and validated AI
 * output (for number verification), the render model, and the PDF as base64.
 * Nothing is written to Postgres or Blob storage. Logs carry only stage
 * names, timings, error classes, sanitized messages, and token counts --
 * never env values, URLs, prompts, or AI response text.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Stop starting new AI attempts ~20s before Vercel's 300s limit so a slow run
// still returns its diagnostics instead of being killed mid-request.
const DEADLINE_MARGIN_MS = 20_000;

function notFound() {
  return new NextResponse("Not Found", { status: 404 });
}

export async function GET() {
  return notFound();
}

export async function POST(request: Request) {
  if (!isPreviewTestRequestAuthorized(process.env, request.headers.get("authorization"))) return notFound();
  const requestStartedAt = Date.now();

  const pool = createReadOnlyPool(process.env);
  if (!pool) {
    return NextResponse.json({ status: "not_ready", stage: "read_only_check", reason: "No direct (non-pooled) Postgres URL is configured for this Preview." }, { status: 503 });
  }

  try {
    const result = await runPreviewTestReport({
      pool,
      createProvider: (onResponseMeta) => new AnthropicWeeklyAnalystProvider({ onResponseMeta }),
      pdfRenderer: new ChromiumPdfRenderer(),
      logoDataUri: loadRrcLogoDataUri(),
      deadlineMs: requestStartedAt + maxDuration * 1000 - DEADLINE_MARGIN_MS
    });

    const summary =
      result.status === "rendered"
        ? { status: result.status, week: result.storageWeekEnding, pages: result.pageCount, model: result.aiModel, diagnostics: result.diagnostics }
        : result;
    console.log("[reports/preview-test]", JSON.stringify(summary));

    if (result.status !== "rendered") return NextResponse.json(result, { status: result.status === "failed" ? 500 : 422 });
    const { pdf, ...rest } = result;
    return NextResponse.json({ ...rest, publishedOrPersisted: false, pdfBase64: pdf.toString("base64") });
  } catch (error) {
    // runPreviewTestReport already converts stage failures into results; this is only for the unexpected.
    const details = { status: "failed", stage: "unexpected", error: { errorClass: errorClassOf(error), message: sanitizeDiagnosticMessage(error) } };
    console.log("[reports/preview-test] failed", JSON.stringify(details));
    return NextResponse.json(details, { status: 500 });
  } finally {
    await pool.end().catch(() => undefined);
  }
}

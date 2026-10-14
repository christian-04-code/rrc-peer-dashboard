import { NextResponse } from "next/server";
import { AnthropicWeeklyAnalystProvider } from "@/lib/reports/ai/anthropic-provider";
import { ChromiumPdfRenderer } from "@/lib/reports/render/pdf-renderer";
import { loadRrcLogoDataUri } from "@/lib/reports/render/branding";
import { createReadOnlyPool, isPreviewTestRequestAuthorized, runPreviewTestReport } from "@/lib/reports/preview-test-report";

/**
 * Preview-only, non-publishing weekly report test run -- see
 * lib/reports/preview-test-report.ts for the full safety design. Responds
 * 404 (indistinguishable from a missing route) unless this is a Vercel
 * Preview deployment AND the request carries the dedicated
 * REPORT_PREVIEW_TEST_SECRET as a Bearer token. POST only, so no crawler,
 * link prefetch, or Vercel cron can trigger it.
 *
 * Returns JSON: run metadata, the frozen-shape payload, the exact AI input
 * and validated AI output (for number verification), the render model, and
 * the PDF as base64. Nothing is written to Postgres or Blob storage.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function notFound() {
  return new NextResponse("Not Found", { status: 404 });
}

export async function GET() {
  return notFound();
}

export async function POST(request: Request) {
  if (!isPreviewTestRequestAuthorized(process.env, request.headers.get("authorization"))) return notFound();

  const pool = createReadOnlyPool(process.env);
  if (!pool) {
    return NextResponse.json({ status: "not_ready", stage: "config", reason: "No direct (non-pooled) Postgres URL is configured for this Preview." }, { status: 503 });
  }

  let stage = "start";
  try {
    stage = "provider";
    const provider = new AnthropicWeeklyAnalystProvider();
    stage = "run";
    const result = await runPreviewTestReport({ pool, provider, pdfRenderer: new ChromiumPdfRenderer(), logoDataUri: loadRrcLogoDataUri() });
    // Non-sensitive summary only -- never env values, URLs, or AI text.
    console.log("[reports/preview-test]", JSON.stringify(result.status === "rendered" ? { status: result.status, week: result.storageWeekEnding, pages: result.pageCount, model: result.aiModel } : result));
    if (result.status !== "rendered") return NextResponse.json(result, { status: 422 });
    const { pdf, ...rest } = result;
    return NextResponse.json({ ...rest, publishedOrPersisted: false, pdfBase64: pdf.toString("base64") });
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    console.log("[reports/preview-test] failed", JSON.stringify({ stage, name }));
    return NextResponse.json({ status: "failed", stage, error: name }, { status: 500 });
  } finally {
    await pool.end().catch(() => undefined);
  }
}

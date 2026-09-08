import type { WeeklyAnalystAssessment } from "@/lib/reports/ai-contract";
import type { WeeklyReportPayload } from "@/lib/reports/weekly-report-types";
import { buildWeeklyReportRenderModel } from "@/lib/reports/render/render-model-builder";
import { renderReportHtml } from "@/lib/reports/render/html-template";
import { MAX_PDF_PAGES } from "@/lib/reports/render/content-budget";
import type { PdfRenderer } from "@/lib/reports/render/pdf-renderer";
import type { WeeklyReportRenderModel } from "@/lib/reports/render/render-model";

/**
 * Phase 7D's one entry point for turning a frozen snapshot + its persisted
 * analyst assessment into PDF bytes -- Section 17's deterministic page-
 * budget policy, in full: render at the STANDARD content budget; if the
 * REAL resulting PDF (via PdfRenderer.renderPdf, never an estimate) is
 * within the 5-page hard maximum, return it. If not, render exactly ONCE
 * more at the REDUCED content budget; if that fits, return it. If it still
 * doesn't fit, fail safely -- no AI retry, no third tier, no endless loop.
 *
 * Consumes ONLY the two frozen/persisted inputs (Section 15/16): this
 * function never queries a DB, never calls an AI provider, never fetches
 * live dashboard data. It also never publishes anything (no call to the
 * snapshot repo's own publish transition, and no ArtifactStorageProvider
 * anywhere in this file) -- that remains Phase 7E+'s job, per Section 22.
 */

export type WeeklyReportPdfResult =
  | { status: "rendered"; pdf: Buffer; pageCount: number; renderModel: WeeklyReportRenderModel; reducedContent: boolean }
  | { status: "failed"; reason: string; lastPageCount: number };

export async function renderWeeklyReportPdf(
  payload: WeeklyReportPayload,
  assessment: WeeklyAnalystAssessment,
  pdfRenderer: PdfRenderer,
  logoDataUri: string | null
): Promise<WeeklyReportPdfResult> {
  const standardModel = buildWeeklyReportRenderModel(payload, assessment, "standard");
  const standardHtml = renderReportHtml(standardModel, logoDataUri);
  const standardResult = await pdfRenderer.renderPdf(standardHtml);

  if (standardResult.pageCount <= MAX_PDF_PAGES) {
    return { status: "rendered", pdf: standardResult.pdf, pageCount: standardResult.pageCount, renderModel: standardModel, reducedContent: false };
  }

  const reducedModel = buildWeeklyReportRenderModel(payload, assessment, "reduced");
  const reducedHtml = renderReportHtml(reducedModel, logoDataUri);
  const reducedResult = await pdfRenderer.renderPdf(reducedHtml);

  if (reducedResult.pageCount <= MAX_PDF_PAGES) {
    return { status: "rendered", pdf: reducedResult.pdf, pageCount: reducedResult.pageCount, renderModel: reducedModel, reducedContent: true };
  }

  return {
    status: "failed",
    reason: `Reduced-content render still produced ${reducedResult.pageCount} pages (hard maximum ${MAX_PDF_PAGES}); the standard attempt produced ${standardResult.pageCount}.`,
    lastPageCount: reducedResult.pageCount
  };
}

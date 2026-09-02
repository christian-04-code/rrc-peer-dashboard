import { NextResponse } from "next/server";
import { renderWeeklyReportPdf } from "@/lib/reports/render/weekly-report-pdf-service";
import { ChromiumPdfRenderer } from "@/lib/reports/render/pdf-renderer";
import { MAX_PDF_PAGES } from "@/lib/reports/render/content-budget";
import type { WeeklyAnalystAssessment } from "@/lib/reports/ai-contract";
import type { WeeklyReportPayload } from "@/lib/reports/weekly-report-types";

/**
 * TEMPORARY Phase 7D.1 diagnostic route -- validates whether the REAL
 * @sparticuz/chromium binary + chromium.args actually launch and render a
 * PDF on Vercel's live serverless runtime (something categorically
 * impossible to test on a macOS development machine, where
 * chromium.args' Lambda-container-tuned flags, e.g. --single-process,
 * cannot pair with a desktop Chrome install -- see
 * docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md §29.8/§29.9). Deterministic
 * fixture data only -- no AI call, no DB read, no Blob upload, no publish.
 * Gated behind a one-time, hardcoded token generated solely for this
 * diagnostic (never the real CRON_SECRET, never reused anywhere else) and
 * a defense-in-depth production guard, even though this branch can never
 * reach Production (it is never merged to `main`).
 *
 * REMOVE THIS ENTIRE DIRECTORY before the final Phase 7D.1 commit --
 * see the architecture doc for confirmation it was removed.
 */

const DIAGNOSTIC_TOKEN = "51c5a3872aa0d5f8dce97a281d3cb953ff8ac071dc726e8e6438446f86f37b5c";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${DIAGNOSTIC_TOKEN}`;
}

function fixturePayload(): WeeklyReportPayload {
  return {
    schemaVersion: "1.0.0",
    storageWeekEnding: "2026-08-28",
    dataCutoffAt: "2026-09-03T18:00:00.000Z",
    modules: {
      storage: [
        {
          evidenceId: "storage:lower48",
          category: "storage",
          metricKey: "lower48_storage",
          label: "Lower 48 Working Gas Storage",
          currentValue: 3212,
          displayValue: "3,212 Bcf",
          unit: "Bcf",
          period: "2026-08-28",
          asOfDate: "2026-08-28",
          sourceIds: ["macro_storage"],
          freshness: "current",
          comparisons: [
            { period: "WoW", metricKey: "lower48_storage", label: "Lower 48 Working Gas Storage", currentValue: 3212, previousValue: 3178, delta: 34, deltaPct: 1.07, direction: "up", basisDescription: "vs. week ending 2026-08-21" }
          ],
          rangeDrivers: ["storage_levels"],
          materialityInputs: { isNewThisWeek: true, changedSincePreviousReport: true, riskSeverityRank: 1, riskState: "MODERATE_RISK", rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 1.07 },
          metadata: {}
        }
      ],
      deterministic_risk_opportunity: [
        {
          evidenceId: "deterministic_risk_opportunity:storage_levels",
          category: "deterministic_risk_opportunity",
          metricKey: "storage_levels",
          label: "Storage",
          currentValue: 1.07,
          displayValue: "MODERATE_RISK",
          unit: "%",
          period: "2026-08-28",
          asOfDate: null,
          sourceIds: ["storage:lower48"],
          freshness: "current",
          comparisons: [],
          rangeDrivers: [],
          materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: 1, riskState: "MODERATE_RISK", rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 1.07 },
          metadata: { riskRank: 1, riskState: "MODERATE_RISK", deterministicReason: "Diagnostic fixture." }
        }
      ]
    },
    sourceManifest: { generatedFrom: [{ key: "macro_storage", label: "EIA Weekly Natural Gas Storage Report (Lower 48)", period: "2026-08-28", freshness: "current", included: true }] }
  };
}

function fixtureAssessment(): WeeklyAnalystAssessment {
  const words = new Array(160).fill("word").join(" ");
  return {
    schemaVersion: "1.1.0",
    aiProvider: "diagnostic-fixture",
    aiModel: "none",
    generatedAt: new Date(0).toISOString(),
    executiveAssessment: words,
    biggestRisk: { title: "Diagnostic risk", assessment: "Diagnostic fixture assessment.", evidenceIds: ["deterministic_risk_opportunity:storage_levels"] },
    biggestOpportunity: { title: "Diagnostic opportunity", assessment: "Diagnostic fixture assessment.", evidenceIds: ["deterministic_risk_opportunity:storage_levels"] },
    whatChanged: [],
    managementWatchItems: [{ item: "Diagnostic watch item", reason: "Diagnostic fixture.", evidenceIds: ["storage:lower48"] }],
    bottomLine: "Diagnostic fixture bottom line.",
    selectedEvidenceIds: ["deterministic_risk_opportunity:storage_levels", "storage:lower48"]
  };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  try {
    const renderer = new ChromiumPdfRenderer();
    const result = await renderWeeklyReportPdf(fixturePayload(), fixtureAssessment(), renderer, null);
    const elapsedMs = Date.now() - start;

    if (result.status === "failed") {
      return NextResponse.json({ ok: false, status: "failed", reason: result.reason, lastPageCount: result.lastPageCount, elapsedMs });
    }

    return NextResponse.json({
      ok: true,
      status: "rendered",
      pageCount: result.pageCount,
      maxPdfPages: MAX_PDF_PAGES,
      withinPageLimit: result.pageCount <= MAX_PDF_PAGES,
      reducedContent: result.reducedContent,
      pdfByteLength: result.pdf.byteLength,
      pdfMagicBytes: result.pdf.subarray(0, 5).toString("latin1"),
      elapsedMs
    });
  } catch (error) {
    const elapsedMs = Date.now() - start;
    return NextResponse.json(
      { ok: false, status: "error", message: error instanceof Error ? error.message : "unknown error", stack: error instanceof Error ? error.stack?.slice(0, 2000) : undefined, elapsedMs },
      { status: 500 }
    );
  }
}

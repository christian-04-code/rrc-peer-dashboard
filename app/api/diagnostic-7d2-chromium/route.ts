import { NextResponse } from "next/server";
import { renderWeeklyReportPdf } from "@/lib/reports/render/weekly-report-pdf-service";
import { ChromiumPdfRenderer } from "@/lib/reports/render/pdf-renderer";
import { MAX_PDF_PAGES } from "@/lib/reports/render/content-budget";
import type { WeeklyAnalystAssessment } from "@/lib/reports/ai-contract";
import type { WeeklyReportPayload } from "@/lib/reports/weekly-report-types";

/**
 * TEMPORARY Phase 7D.2 diagnostic route -- validates whether the REAL
 * @sparticuz/chromium binary + chromium.args actually launch and render a
 * PDF on Vercel's live serverless runtime, closing the one gap Phase 7D.1
 * could not (see docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md §29.9/§29.10).
 * Deterministic fixture data only -- no AI call, no DB read/write, no Blob
 * upload, no publish. Gated behind a one-time, hardcoded token generated
 * solely for this diagnostic (never the real CRON_SECRET, never reused
 * from Phase 7D.1's -- that one is already visible in git history) and a
 * defense-in-depth production guard, even though this branch can never
 * reach Production (it is never merged to `main`). Never returns the PDF
 * bytes themselves -- only safe metadata.
 *
 * REMOVE THIS ENTIRE DIRECTORY once the live check has run -- see the
 * architecture doc for confirmation it was removed.
 */

const DIAGNOSTIC_TOKEN = "baf5291523635b1d623966fd7f6b81f46eb27ab27fef53abea3e9e84ea9465c5";
const CHROMIUM_PACKAGE_VERSION = "149.0.0"; // package.json's pinned @sparticuz/chromium version -- not dynamically importable (its package.json isn't in its "exports" map)
const PUPPETEER_CORE_PACKAGE_VERSION = "25.9.0";

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

  const runtimeInfo = {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelRegion: process.env.VERCEL_REGION ?? null,
    pinnedPuppeteerCoreVersion: PUPPETEER_CORE_PACKAGE_VERSION,
    pinnedChromiumPackageVersion: CHROMIUM_PACKAGE_VERSION
  };

  const start = Date.now();
  try {
    const renderer = new ChromiumPdfRenderer();
    const result = await renderWeeklyReportPdf(fixturePayload(), fixtureAssessment(), renderer, null);
    const elapsedMs = Date.now() - start;

    if (result.status === "failed") {
      // "failed" here means chromium launched and rendered fine on BOTH
      // attempts -- it's the >5-page content budget that failed, not chromium.
      return NextResponse.json({ ok: false, status: "failed", chromiumLaunched: true, reason: result.reason, lastPageCount: result.lastPageCount, elapsedMs, runtimeInfo });
    }

    return NextResponse.json({
      ok: true,
      status: "rendered",
      chromiumLaunched: true,
      pdfProduced: result.pdf.byteLength > 0,
      pdfByteLength: result.pdf.byteLength,
      pdfMagicBytes: result.pdf.subarray(0, 5).toString("latin1"),
      pageCount: result.pageCount,
      maxPdfPages: MAX_PDF_PAGES,
      withinPageLimit: result.pageCount <= MAX_PDF_PAGES,
      reducedContent: result.reducedContent,
      elapsedMs,
      runtimeInfo
    });
  } catch (error) {
    const elapsedMs = Date.now() - start;
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        chromiumLaunched: false,
        message: error instanceof Error ? error.message : "unknown error",
        stack: error instanceof Error ? error.stack?.slice(0, 2000) : undefined,
        elapsedMs,
        runtimeInfo
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { runNewsPipeline } from "@/lib/news/pipeline/runner";
import { MANUAL_ANALYSIS_HARD_CAP, runBoundedManualAnalysis } from "@/lib/news/ai/manual-analysis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Phase 3 bounded validation endpoint.
 *
 * This is deliberately NOT registered in vercel.json and therefore is not a
 * production cron. It first runs the existing deterministic collection /
 * normalization / dedupe / relevance pipeline, then permits at most five
 * already-retained articles to reach the AI provider.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pipeline = await runNewsPipeline();
    const analysis = await runBoundedManualAnalysis({ maxArticles: MANUAL_ANALYSIS_HARD_CAP });

    return NextResponse.json({
      phase: 3,
      mode: "bounded_manual_validation",
      hardCap: MANUAL_ANALYSIS_HARD_CAP,
      pipeline: {
        runId: pipeline.runId,
        runDate: pipeline.runDate,
        status: pipeline.status,
        sourcesAttempted: pipeline.sourcesAttempted,
        sourcesSuccessful: pipeline.sourcesSuccessful,
        sourceFailures: pipeline.sourceFailures,
        articlesDiscovered: pipeline.articlesDiscovered,
        duplicatesRemoved: pipeline.duplicatesRemoved,
        articlesRejected: pipeline.articlesRejected,
        articlesRetained: pipeline.articlesRetained,
        errors: pipeline.errors,
        durationMs: pipeline.durationMs
      },
      analysis
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Phase 3 validation error";
    return NextResponse.json(
      {
        phase: 3,
        mode: "bounded_manual_validation",
        hardCap: MANUAL_ANALYSIS_HARD_CAP,
        error: message.slice(0, 500)
      },
      { status: 500 }
    );
  }
}

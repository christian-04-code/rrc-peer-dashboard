import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/lib/news/persistence/db";
import { getLatestPipelineRun } from "@/lib/news/persistence/pipeline-runs-repo";

export const dynamic = "force-dynamic";

/**
 * Read-only summary of the most recent collection run, for the News tab's
 * Daily Intelligence header. Public/unauthenticated like /api/news itself
 * -- this exposes only aggregate counts, never raw article content or
 * credentials, and performs no write of any kind.
 */
export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ available: false, reason: "not_configured" }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
  }

  try {
    const pool = getPool();
    const run = await getLatestPipelineRun(pool);
    if (!run) {
      return NextResponse.json({ available: false, reason: "no_run" }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
    }

    return NextResponse.json(
      {
        available: true,
        runId: run.id,
        runDate: run.run_date,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        status: run.status,
        sourcesAttempted: run.sources_attempted,
        sourcesSuccessful: run.sources_successful,
        articlesDiscovered: run.articles_discovered,
        duplicatesRemoved: run.duplicates_removed,
        articlesRejected: run.articles_rejected,
        articlesRetained: run.articles_retained,
        aiAnalysesAttempted: run.ai_analyses_attempted,
        aiAnalysesCompleted: run.ai_analyses_completed,
        aiAnalysesFailed: run.ai_analyses_failed ?? 0
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
    );
  } catch {
    return NextResponse.json({ available: false, reason: "error" }, { status: 500 });
  }
}

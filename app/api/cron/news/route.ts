import { NextResponse } from "next/server";
import { runNewsPipeline } from "@/lib/news/pipeline/runner";

export const dynamic = "force-dynamic";

/**
 * Manually-invocable pipeline endpoint (Phase 2). Not wired to Vercel Cron
 * yet -- that's Phase 5. Protected the same way a real Vercel Cron
 * invocation would be (`Authorization: Bearer $CRON_SECRET`), so activating
 * the schedule later is a vercel.json change only, not a code change.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runNewsPipeline();

  return NextResponse.json({
    runId: result.runId,
    runDate: result.runDate,
    status: result.status,
    sourcesAttempted: result.sourcesAttempted,
    sourcesSuccessful: result.sourcesSuccessful,
    sourceFailures: result.sourceFailures,
    articlesDiscovered: result.articlesDiscovered,
    duplicatesRemoved: result.duplicatesRemoved,
    articlesRejected: result.articlesRejected,
    articlesRetained: result.articlesRetained,
    aiAnalysesAttempted: result.aiAnalysesAttempted,
    aiAnalysesCompleted: result.aiAnalysesCompleted,
    errors: result.errors,
    durationMs: result.durationMs
  });
}

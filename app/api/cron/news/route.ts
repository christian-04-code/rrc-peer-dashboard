import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/persistence/db";
import { runNewsMigrations } from "@/lib/news/persistence/migrate";
import { runDailyNewsOrchestration } from "@/lib/news/pipeline/orchestrate";

export const dynamic = "force-dynamic";
// Hobby's fluid-compute default/max is 300s; collection + up to
// PIPELINE_CONFIG.maxAiAnalysesPerRun sequential bounded-retry AI calls
// stay well inside that in the normal case, and the hard cap plus bounded
// retry keep the worst case bounded rather than open-ended.
export const maxDuration = 300;

/**
 * The one production scheduled-orchestration entry point (Phase 5): runs
 * the deterministic collection/normalize/dedupe/relevance/persistence
 * pipeline, then -- when storage and an AI key are configured -- bounded AI
 * analysis of exactly the articles that run retained, via the same shared
 * `runDailyNewsOrchestration` domain function used for every invocation of
 * this route, manual or scheduled. This is the only route registered as a
 * Vercel Cron target; `/api/cron/news/analyze` remains a separate,
 * lower-capped, manual-only validation endpoint and must never be added to
 * vercel.json (enforced by its own test).
 *
 * Protected the same way a real Vercel Cron invocation authenticates:
 * `Authorization: Bearer $CRON_SECRET`, which Vercel automatically attaches
 * to cron-triggered requests when `CRON_SECRET` is set on the project.
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

  try {
    // Idempotent (CREATE/ADD ... IF NOT EXISTS) -- safe to run on every
    // invocation, and guarantees the schema is present in production
    // without depending on someone remembering to run `npm run news:migrate`
    // against Neon by hand before the first scheduled run. Skipped when no
    // database is configured so the deterministic-only path (no persistence)
    // still works exactly as it did before Phase 5.
    if (isDatabaseConfigured()) {
      await runNewsMigrations();
    }

    const result = await runDailyNewsOrchestration();

    if (result.concurrentRunSkipped) {
      return NextResponse.json({ status: "skipped_concurrent_run", reason: result.reason });
    }

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
      aiAnalysesFailed: result.aiAnalysesFailed,
      aiSkippedReason: result.aiSkippedReason,
      errors: result.errors,
      durationMs: result.durationMs
    });
  } catch {
    // No detail from an unexpected/fatal error (DB connectivity, migration
    // failure, an unhandled provider exception) ever reaches the response
    // body -- diagnose those from server logs, not this endpoint's output.
    return NextResponse.json({ error: "News orchestration failed in the server runtime." }, { status: 500 });
  }
}

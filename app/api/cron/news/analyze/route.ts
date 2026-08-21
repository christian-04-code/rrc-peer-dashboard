import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/lib/news/persistence/db";
import { runNewsMigrations } from "@/lib/news/persistence/migrate";
import { runNewsPipeline } from "@/lib/news/pipeline/runner";
import { analyzeEligibleArticles } from "@/lib/news/pipeline/analyze";
import { AnthropicNewsAnalysisProvider } from "@/lib/news/ai/anthropic-provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Phase 3 bounded validation endpoint. Bearer-token gated the same way
 * /api/cron/news is -- reuses CRON_SECRET rather than a second secret.
 * Deliberately NOT registered in vercel.json and therefore not a
 * production cron. No request parameter is ever consulted: the article
 * count, model, and every other choice are fixed in code, not accepted
 * from the caller.
 *
 * Runs the existing deterministic collection/normalize/dedupe/relevance
 * pipeline first, then analyzes at most PHASE_3_VALIDATION_MAX_ARTICLES
 * already-retained articles from that same run -- current-run scoping, so
 * a validation call always analyzes exactly the articles it just
 * collected, never an unrelated backlog from an earlier run.
 */
const PHASE_3_VALIDATION_MAX_ARTICLES = 5;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "News storage is not configured (DATABASE_URL/POSTGRES_URL unset)." }, { status: 503 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 503 });
  }

  try {
    await runNewsMigrations();

    const pool = getPool();
    const pipeline = await runNewsPipeline();
    const provider = new AnthropicNewsAnalysisProvider();

    const analysis = await analyzeEligibleArticles(pool, provider, {
      maxArticles: PHASE_3_VALIDATION_MAX_ARTICLES,
      pipelineRunId: pipeline.runId
    });

    return NextResponse.json({
      phase: 3,
      mode: "bounded_manual_validation",
      hardCap: PHASE_3_VALIDATION_MAX_ARTICLES,
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
        durationMs: pipeline.durationMs
      },
      analysis: {
        ok: analysis.failed === 0,
        eligibleFound: analysis.eligibleFound,
        attempted: analysis.attempted,
        completed: analysis.completed,
        failed: analysis.failed,
        results: analysis.results,
        errors: analysis.errors
      }
    });
  } catch {
    // No detail from an unexpected/fatal error (DB connectivity, auth,
    // an unhandled provider exception) ever reaches the response body --
    // diagnose those from server logs, not this endpoint's output.
    return NextResponse.json(
      { phase: 3, mode: "bounded_manual_validation", hardCap: PHASE_3_VALIDATION_MAX_ARTICLES, error: "Phase 3 validation failed in the server runtime." },
      { status: 500 }
    );
  }
}

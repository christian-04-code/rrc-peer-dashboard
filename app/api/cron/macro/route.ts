import { NextResponse } from "next/server";
import { runMacroDailyOrchestration } from "@/lib/market/macro-orchestrate-daily";

export const dynamic = "force-dynamic";
// Same Hobby fluid-compute ceiling app/api/cron/news/route.ts uses. This run
// does one STEO refresh (a single upstream EIA request across all 9 series)
// plus at most one Anthropic call -- comfortably inside the news cron's
// already-proven budget, not a heavier workload.
export const maxDuration = 300;

/**
 * Phase 6D's one scheduled Macro entry point -- a genuinely separate cron
 * job from /api/cron/news (Section 18: "prefer clean separation"), on its
 * own vercel.json schedule offset from news's. Confirmed live against
 * current Vercel docs: Hobby allows up to 100 cron jobs per project (each
 * still capped at once/day), so adding this one carries no platform-limit
 * risk. Protected the same way: Authorization: Bearer $CRON_SECRET, which
 * Vercel auto-attaches to real cron-triggered requests.
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
    const result = await runMacroDailyOrchestration();

    if (result.concurrentRunSkipped) {
      return NextResponse.json({ status: "skipped_concurrent_run", reason: result.reason });
    }

    return NextResponse.json({
      status: "ok",
      steoSeriesRefreshed: result.steoRefreshed,
      steoSeriesFailed: result.steoFailed,
      fingerprint: result.fingerprint,
      aiSummaryGenerated: result.aiGenerated,
      aiSummaryCacheHit: result.aiCacheHit,
      aiSkippedReason: result.aiSkippedReason
    });
  } catch {
    // No detail from an unexpected/fatal error ever reaches the response body -- diagnose from server logs.
    return NextResponse.json({ error: "Macro orchestration failed in the server runtime." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { orchestrateWeeklyReport } from "@/lib/reports/orchestrate-weekly";

export const dynamic = "force-dynamic";
// Chromium cold start + a several-page PDF render is the heaviest step here
// (Phase 7D.2's live measurement: ~3s for a 2-page render, cold; a full
// 4-5 page report with a real Anthropic call comfortably fits well inside
// this ceiling) -- same Hobby fluid-compute ceiling app/api/cron/news and
// app/api/cron/macro already use.
export const maxDuration = 300;

/**
 * Phase 7F's one scheduled Weekly Report entry point -- a genuinely
 * separate cron job from /api/cron/news and /api/cron/macro (same "prefer
 * clean separation" reasoning Phase 6D already established for Macro vs.
 * News), on its own vercel.json schedule. All real orchestration logic
 * lives in lib/reports/orchestrate-weekly.ts (locking, readiness, the
 * safety buffer, and calling the already-built snapshot/analysis/publish
 * services) -- this route is intentionally thin: authenticate, call it,
 * translate its result to a concise JSON response, never leak internal
 * detail. Protected the same way every other cron route is: Authorization:
 * Bearer $CRON_SECRET, which Vercel auto-attaches to real cron-triggered
 * requests.
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
    const result = await orchestrateWeeklyReport();
    return NextResponse.json(result);
  } catch {
    // No detail from an unexpected/fatal error ever reaches the response
    // body (no Anthropic key, Blob token, DB credential, or stack trace) --
    // diagnose from server logs, same convention as the other two crons.
    return NextResponse.json({ stage: "failed", reason: "Weekly report orchestration failed in the server runtime." }, { status: 500 });
  }
}

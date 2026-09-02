import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/lib/persistence/db";
import { getLatestWeeklyReportStatus, type LatestWeeklyReportStatus } from "@/lib/reports/latest-report-service";

export const dynamic = "force-dynamic";

/**
 * Phase 7E's lightweight "is a weekly report available, and what week is
 * it" check -- what the Overview download button fetches on mount to
 * decide its own render state, deliberately separate from
 * `/api/reports/latest/download` (which returns the actual PDF bytes) so
 * checking availability never costs downloading a multi-hundred-KB file.
 * All real logic lives in lib/reports/latest-report-service.ts, which is
 * what carries the actual "never build/AI/render here" guarantees.
 */
export type WeeklyReportLatestStatus = LatestWeeklyReportStatus;

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json<WeeklyReportLatestStatus>({ available: false });
  }
  try {
    const status = await getLatestWeeklyReportStatus(getPool());
    return NextResponse.json<WeeklyReportLatestStatus>(status);
  } catch {
    // A degraded/unreachable DB is reported the same as "nothing published
    // yet" -- the button's unavailable state is intentionally generic and
    // never leaks connection details.
    return NextResponse.json<WeeklyReportLatestStatus>({ available: false });
  }
}

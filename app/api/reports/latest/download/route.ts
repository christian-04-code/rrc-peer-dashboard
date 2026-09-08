import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/lib/persistence/db";
import { getLatestWeeklyReportDownload } from "@/lib/reports/latest-report-service";
import { VercelBlobArtifactStore, type ArtifactStorageProvider } from "@/lib/reports/render/artifact-store";

export const dynamic = "force-dynamic";

/**
 * Phase 7E's actual download path. Serves the bytes of an already-published
 * PDF artifact -- nothing here builds a snapshot, calls AI, launches
 * Chromium, or reconstructs anything from live dashboard data (see
 * lib/reports/latest-report-service.ts, which carries the real logic and
 * is what's actually unit-tested).
 */

function resolveArtifactStorage(): ArtifactStorageProvider | null {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    return new VercelBlobArtifactStore();
  } catch {
    return null;
  }
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ available: false }, { status: 404 });
  }

  let result;
  try {
    result = await getLatestWeeklyReportDownload(getPool(), resolveArtifactStorage());
  } catch {
    return NextResponse.json({ available: false }, { status: 503 });
  }

  if (!result.available) {
    return NextResponse.json({ available: false }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Content-Length": String(result.bytes.byteLength),
      "Cache-Control": "private, no-store"
    }
  });
}

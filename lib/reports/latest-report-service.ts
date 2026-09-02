import type { Pool } from "pg";
import { getLatestPublishedSnapshot } from "@/lib/reports/persistence/report-repo";
import type { ArtifactStorageProvider } from "@/lib/reports/render/artifact-store";

/**
 * Phase 7E's read-side logic for `app/api/reports/latest/route.ts` and
 * `app/api/reports/latest/download/route.ts` -- pulled out of those route
 * files (rather than inlined) for the same reason every other Phase 7
 * route-adjacent piece of logic lives in `lib/`: it keeps the branching
 * fully unit-testable against a fake Pool/ArtifactStorageProvider, with no
 * real Postgres or Vercel Blob required, matching this project's
 * established thin-route convention (e.g. `app/api/macro/risk/route.ts`
 * delegates to `lib/market/macro-risk-orchestrate.ts`).
 *
 * Both functions here are read-only and cheap: `getLatestPublishedSnapshot()`
 * is a single indexed query for the one row Phase 7A decided the app is
 * ever allowed to expose to users. Neither function here builds a
 * snapshot, calls AI, launches Chromium, or reconstructs anything from
 * live dashboard data -- see Section 15/16 of the architecture doc's
 * "renderer must not query live dashboard data independently" rule, which
 * applies equally on the read side: this is a pure lookup of already-
 * published metadata plus an already-stored artifact's bytes.
 */

export type LatestWeeklyReportStatus =
  | { available: true; storageWeekEnding: string; publishedAt: string; sizeBytes: number | null }
  | { available: false };

export async function getLatestWeeklyReportStatus(pool: Pool): Promise<LatestWeeklyReportStatus> {
  const snapshot = await getLatestPublishedSnapshot(pool);
  if (!snapshot || !snapshot.artifactKey || !snapshot.publishedAt) return { available: false };
  return { available: true, storageWeekEnding: snapshot.storageWeekEnding, publishedAt: snapshot.publishedAt, sizeBytes: snapshot.artifactSizeBytes };
}

export type LatestWeeklyReportDownload =
  | { available: true; bytes: Buffer; contentType: string; filename: string }
  | { available: false };

/**
 * `artifactStorage` is nullable so the route can pass `null` when no real
 * provider is configured (e.g. `BLOB_READ_WRITE_TOKEN` unset) -- treated
 * identically to "artifact unavailable," never a distinct error path that
 * might leak which env var is missing.
 */
export async function getLatestWeeklyReportDownload(pool: Pool, artifactStorage: ArtifactStorageProvider | null): Promise<LatestWeeklyReportDownload> {
  const snapshot = await getLatestPublishedSnapshot(pool);
  if (!snapshot || !snapshot.artifactKey) return { available: false };
  if (!artifactStorage) return { available: false };

  let bytes: Buffer | null;
  try {
    bytes = await artifactStorage.get(snapshot.artifactKey);
  } catch {
    bytes = null;
  }
  if (!bytes) return { available: false };

  return {
    available: true,
    bytes,
    contentType: snapshot.artifactContentType ?? "application/pdf",
    filename: `Weekly-Range-Resources-AI-Intelligence-Report-${snapshot.storageWeekEnding}.pdf`
  };
}

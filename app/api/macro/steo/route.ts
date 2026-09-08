import { NextResponse } from "next/server";
import { fetchSteoTable } from "@/lib/eia/macro-fundamentals";
import { EIA_ROUTES } from "@/lib/eia/series";
import {
  computeForecastRevisions,
  normalizeSteoTable,
  toSnapshotRecord
} from "@/lib/market/macro-steo";
import type { SteoForecastRevision, SteoNormalizedSeries, SteoSeriesKey } from "@/lib/market/macro-steo-types";
import { getPool, isDatabaseConfigured } from "@/lib/persistence/db";
import { runMacroMigrations } from "@/lib/market/persistence/migrate";
import { getCurrentAndPreviousSteoSnapshot, upsertSteoSnapshot } from "@/lib/market/persistence/steo-repo";

export const dynamic = "force-dynamic";
export const revalidate = 21_600;

export type MacroSteoResponse = {
  generatedAt: string;
  status: "ok" | "unavailable";
  series: Partial<Record<SteoSeriesKey, SteoNormalizedSeries>>;
  revisions: Partial<Record<SteoSeriesKey, SteoForecastRevision[]>>;
  snapshotsPersisted: boolean;
  error?: string;
};

/**
 * No dedicated cron job persists STEO snapshots (EIA only republishes STEO
 * monthly, and Vercel Hobby's cron allowance is scarce -- already spent on
 * the one daily news cron). Instead, snapshot capture is opportunistic: any
 * real request to this route upserts the current fetch as this calendar
 * month's snapshot. upsertSteoSnapshot is idempotent per (series, month), so
 * repeated traffic within the same month just keeps that month's row current
 * rather than creating duplicates -- real Macro-tab traffic across different
 * calendar months is what populates the history computeForecastRevisions
 * needs. Until a second month's snapshot exists, revisions for a series are
 * simply omitted, never fabricated.
 */
export async function GET() {
  const generatedAt = new Date().toISOString();

  let normalized: Partial<Record<SteoSeriesKey, SteoNormalizedSeries>>;
  try {
    const table = await fetchSteoTable();
    normalized = normalizeSteoTable(table);
  } catch (error) {
    const response: MacroSteoResponse = {
      generatedAt,
      status: "unavailable",
      series: {},
      revisions: {},
      snapshotsPersisted: false,
      error: error instanceof Error ? error.message : "STEO unavailable"
    };
    return NextResponse.json(response, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
  }

  const revisions: Partial<Record<SteoSeriesKey, SteoForecastRevision[]>> = {};
  let snapshotsPersisted = false;

  if (isDatabaseConfigured()) {
    try {
      await runMacroMigrations();
      const pool = getPool();
      for (const [key, series] of Object.entries(normalized) as [SteoSeriesKey, SteoNormalizedSeries][]) {
        const snapshot = toSnapshotRecord(series, EIA_ROUTES.steo);
        await upsertSteoSnapshot(pool, snapshot);
      }
      snapshotsPersisted = true;
      for (const [key, series] of Object.entries(normalized) as [SteoSeriesKey, SteoNormalizedSeries][]) {
        const { current, previous } = await getCurrentAndPreviousSteoSnapshot(pool, series.seriesId);
        if (current && previous && previous.snapshotMonth !== current.snapshotMonth) {
          revisions[key] = computeForecastRevisions(previous, current);
        }
      }
    } catch {
      // A degraded/unconfigured DB never blocks serving the live STEO fetch --
      // revisions simply stay empty rather than the whole route failing.
    }
  }

  const response: MacroSteoResponse = { generatedAt, status: "ok", series: normalized, revisions, snapshotsPersisted };
  return NextResponse.json(response, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600" } });
}

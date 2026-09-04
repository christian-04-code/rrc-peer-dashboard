import type { Pool } from "pg";
import { fetchSteoTable } from "@/lib/eia/macro-fundamentals";
import type { EiaTableResult } from "@/lib/eia/client";
import { EIA_ROUTES } from "@/lib/eia/series";
import { normalizeSteoTable, toSnapshotRecord } from "@/lib/market/macro-steo";
import { upsertSteoSnapshot } from "@/lib/market/persistence/steo-repo";
import type { SteoSeriesKey } from "@/lib/market/macro-steo-types";

export type SteoRefreshResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: string[];
  seriesRefreshed: SteoSeriesKey[];
};

/**
 * The one STEO refresh orchestration (future callers: a Phase 6E scheduled
 * route). All 4 verified STEO series share a single upstream EIA request
 * (one `facets[seriesId][]` table fetch, not 4 separate HTTP calls) -- if
 * that fetch itself fails or returns a response fetchEiaTable can't
 * validate (e.g. an upstream schema change), the whole refresh fails
 * cleanly with attempted=0 rather than persisting anything malformed.
 * Once the fetch succeeds, persistence is isolated per series: one series'
 * write failing (e.g. a transient DB error) never blocks the other three
 * from being saved, same "one failure doesn't abort the batch" principle
 * lib/news/pipeline/runner.ts already uses for its own sources.
 *
 * Callers own migrations/pool lifecycle, same convention as
 * lib/news/pipeline/runner.ts's runNewsPipeline -- this function assumes an
 * already-connected pool and an already-migrated schema.
 */
export async function refreshSteoSnapshots(
  pool: Pool,
  options: { fetchTable?: () => Promise<EiaTableResult> } = {}
): Promise<SteoRefreshResult> {
  const result: SteoRefreshResult = { attempted: 0, succeeded: 0, failed: 0, errors: [], seriesRefreshed: [] };
  const fetchTable = options.fetchTable ?? fetchSteoTable;

  let normalized: ReturnType<typeof normalizeSteoTable>;
  try {
    const table = await fetchTable();
    normalized = normalizeSteoTable(table);
  } catch (error) {
    result.errors.push(`STEO fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }

  for (const [key, series] of Object.entries(normalized)) {
    if (!series) continue;
    result.attempted += 1;
    try {
      const snapshot = toSnapshotRecord(series, EIA_ROUTES.steo);
      await upsertSteoSnapshot(pool, snapshot);
      result.succeeded += 1;
      result.seriesRefreshed.push(key as SteoSeriesKey);
    } catch (error) {
      result.failed += 1;
      result.errors.push(`Failed to persist STEO series "${key}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}

import type { EiaTableResult, EiaTableRow } from "@/lib/eia/client";
import { EIA_STEO_SERIES } from "@/lib/eia/series";
import type { SteoForecastRevision, SteoNormalizedSeries, SteoPoint, SteoSeriesKey, SteoSnapshotFreshness, SteoSnapshotRecord } from "@/lib/market/macro-steo-types";

const STEO_SERIES_TO_KEY = new Map<string, SteoSeriesKey>(
  Object.entries(EIA_STEO_SERIES).map(([key, seriesId]) => [seriesId, key as SteoSeriesKey])
);

function pointsFrom(rows: EiaTableRow[]): SteoPoint[] {
  return rows
    .map((row) => ({ period: row.period, value: row.value }))
    .sort((a, b) => b.period.localeCompare(a.period));
}

/**
 * Groups a raw fetchSteoTable() result by series and normalizes it,
 * reading `label`/`unit` directly from each row's own `seriesDescription`/
 * `unit` fields (both confirmed present on every STEO row this session) --
 * never a hardcoded label/unit that could silently drift from what EIA
 * actually reports.
 */
export function normalizeSteoTable(result: EiaTableResult): Partial<Record<SteoSeriesKey, SteoNormalizedSeries>> {
  const grouped = new Map<SteoSeriesKey, EiaTableRow[]>();
  const meta = new Map<SteoSeriesKey, { label: string; unit: string }>();

  for (const row of result.rows) {
    const rawSeriesId = typeof row.seriesId === "string" ? row.seriesId : "";
    const key = STEO_SERIES_TO_KEY.get(rawSeriesId);
    if (!key) continue;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
    if (!meta.has(key)) {
      meta.set(key, {
        label: typeof row.seriesDescription === "string" ? row.seriesDescription : rawSeriesId,
        unit: typeof row.unit === "string" ? row.unit : ""
      });
    }
  }

  const normalized: Partial<Record<SteoSeriesKey, SteoNormalizedSeries>> = {};
  for (const [key, rows] of grouped) {
    const info = meta.get(key);
    if (!info) continue;
    normalized[key] = {
      id: key,
      seriesId: EIA_STEO_SERIES[key],
      label: info.label,
      unit: info.unit,
      frequency: "monthly",
      fetchedAt: result.fetchedAt,
      points: pointsFrom(rows)
    };
  }
  return normalized;
}

/** 'YYYY-MM' for the calendar month a snapshot was fetched -- the practical proxy for "which STEO release this reflects" (EIA's API exposes no cleaner vintage identifier; see lib/market/macro-steo-types.ts). */
export function snapshotMonthFrom(fetchedAtIso: string): string {
  return fetchedAtIso.slice(0, 7);
}

export function toSnapshotRecord(series: SteoNormalizedSeries, sourceRoute: string): SteoSnapshotRecord {
  return {
    seriesId: series.seriesId,
    label: series.label,
    unit: series.unit,
    snapshotMonth: snapshotMonthFrom(series.fetchedAt),
    fetchedAt: series.fetchedAt,
    sourceRoute,
    points: series.points
  };
}

/**
 * Compares two point-in-time snapshots of the *same* series and returns one
 * revision per forecast period present in both. Pure and deterministic --
 * this is the only mechanism for "EIA raised its forecast by X" claims;
 * nothing here calls AI or infers a revision that isn't a plain arithmetic
 * difference between two persisted, real fetches.
 */
export function computeForecastRevisions(previous: SteoSnapshotRecord, current: SteoSnapshotRecord): SteoForecastRevision[] {
  if (previous.seriesId !== current.seriesId) {
    throw new Error(`computeForecastRevisions: snapshot seriesId mismatch ("${previous.seriesId}" vs "${current.seriesId}").`);
  }
  const previousByPeriod = new Map(previous.points.map((point) => [point.period, point.value]));
  const revisions: SteoForecastRevision[] = [];

  for (const point of current.points) {
    const previousValue = previousByPeriod.get(point.period);
    if (previousValue === undefined) continue;
    const delta = point.value - previousValue;
    revisions.push({
      seriesId: current.seriesId,
      label: current.label,
      unit: current.unit,
      period: point.period,
      previousSnapshotMonth: previous.snapshotMonth,
      previousValue,
      currentSnapshotMonth: current.snapshotMonth,
      currentValue: point.value,
      delta,
      deltaPct: previousValue === 0 ? null : (delta / Math.abs(previousValue)) * 100
    });
  }

  return revisions.sort((a, b) => a.period.localeCompare(b.period));
}

const SNAPSHOT_CURRENT_DAYS = 35;
const SNAPSHOT_LAGGED_DAYS = 65;

/** Freshness of the snapshot itself (when we last fetched it), not of any individual forecast period within it -- see SteoSnapshotFreshness's doc comment. */
export function calculateSnapshotFreshness(fetchedAtIso: string | null, now = new Date()): SteoSnapshotFreshness {
  if (!fetchedAtIso) return "unavailable";
  const fetchedAt = new Date(fetchedAtIso);
  if (Number.isNaN(fetchedAt.getTime())) return "unavailable";
  const ageDays = (now.getTime() - fetchedAt.getTime()) / 86_400_000;
  if (ageDays <= SNAPSHOT_CURRENT_DAYS) return "current";
  return ageDays <= SNAPSHOT_LAGGED_DAYS ? "lagged" : "stale";
}

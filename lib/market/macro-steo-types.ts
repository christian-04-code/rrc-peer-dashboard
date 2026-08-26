/**
 * Canonical STEO (Short-Term Energy Outlook) types, Phase 6. Kept separate
 * from lib/market/macro-types.ts (EIA "fundamentals" -- storage/production/
 * demand, all observed actuals) because STEO is forecast data with a
 * genuinely different shape: EIA's API only ever returns the *current*
 * vintage of a forecast curve (verified this session -- there is no vintage
 * facet), so tracking how a forecast changes over time requires our own
 * point-in-time snapshots, not just a longer history array.
 */

/** Keys verified against the real EIA API -- see EIA_STEO_SERIES in lib/eia/series.ts for why the list stops here (and for two real wrong guesses this project made and corrected). */
export type SteoSeriesKey =
  | "henryHubForecast"
  | "dryGasProductionForecast"
  | "electricPowerConsumptionForecast"
  | "workingGasStorageForecast"
  | "lngExportsForecast"
  | "totalConsumptionForecast"
  | "commercialConsumptionForecast"
  | "residentialConsumptionForecast"
  | "industrialConsumptionForecast";

export type SteoPoint = {
  period: string;
  value: number;
};

/** One series as normalized from a single live fetch -- label/unit come directly from EIA's own response (seriesDescription/unit fields), not hardcoded, so a real EIA description or unit change is reflected automatically rather than silently going stale in our own copy. */
export type SteoNormalizedSeries = {
  id: SteoSeriesKey;
  seriesId: string;
  label: string;
  unit: string;
  frequency: "monthly";
  fetchedAt: string;
  points: SteoPoint[];
};

/** The shape persisted to macro_steo_snapshots -- one row per (series, calendar month fetched). */
export type SteoSnapshotRecord = {
  seriesId: string;
  label: string;
  unit: string;
  snapshotMonth: string;
  fetchedAt: string;
  sourceRoute: string;
  points: SteoPoint[];
};

/** A single forecast-period comparison between two snapshots of the same series. */
export type SteoForecastRevision = {
  seriesId: string;
  label: string;
  unit: string;
  period: string;
  previousSnapshotMonth: string;
  previousValue: number;
  currentSnapshotMonth: string;
  currentValue: number;
  delta: number;
  deltaPct: number | null;
};

/** Snapshot-level freshness -- distinct from lib/market/macro-analytics.ts's calculateFreshness, which is built around an *observed actual*'s own period. A STEO forecast row's period can legitimately be a year in the future; what determines freshness for a forecast series is how recently *we fetched it*, not how far out the period it describes is. */
export type SteoSnapshotFreshness = "current" | "lagged" | "stale" | "unavailable";

import { fetchEiaTable } from "@/lib/eia/client";
import { EIA_FACETS, EIA_ROUTES, EIA_SERIES, EIA_STEO_SERIES } from "@/lib/eia/series";

// Each table endpoint gets its own explicit, realistic production timeout
// instead of inheriting fetchEiaTable's generic fallback. Regional storage
// and state production request thousands of rows (length 2000/2500) and have
// been observed to run past 8s in production. Demand requests far fewer rows
// (length 400) but a cold (uncached) request was observed timing out at a
// 20s threshold in production regardless, so it gets the same 25s headroom
// as the two heavier endpoints rather than a lighter budget.
const REGIONAL_STORAGE_TIMEOUT_MS = 25_000;
const STATE_PRODUCTION_TIMEOUT_MS = 25_000;
const DEMAND_TIMEOUT_MS = 25_000;
// STEO returns a handful of series over an ~18-month horizon (well under
// 100 rows per series) -- much lighter than the regional/state/demand
// tables above, but given the same 25s headroom for consistency rather than
// a separately-tuned lighter budget that's never been observed in production.
const STEO_TIMEOUT_MS = 25_000;

export function fetchRegionalStorageTable() {
  return fetchEiaTable({
    route: EIA_ROUTES.weeklyStorage,
    frequency: "weekly",
    facets: { series: Object.values(EIA_SERIES.regionalStorage) },
    length: 2000,
    revalidate: 3600,
    timeoutMs: REGIONAL_STORAGE_TIMEOUT_MS
  });
}

export function fetchStateMarketedProductionTable() {
  return fetchEiaTable({
    route: EIA_ROUTES.stateProduction,
    frequency: "monthly",
    facets: {
      product: [EIA_FACETS.stateMarketedProduction.product],
      process: [EIA_FACETS.stateMarketedProduction.process]
    },
    length: 2500,
    revalidate: 21_600,
    timeoutMs: STATE_PRODUCTION_TIMEOUT_MS
  });
}

export function fetchDemandTable() {
  return fetchEiaTable({
    route: EIA_ROUTES.consumption,
    frequency: "monthly",
    facets: { series: Object.values(EIA_SERIES.demand) },
    length: 400,
    revalidate: 21_600,
    timeoutMs: DEMAND_TIMEOUT_MS
  });
}

/**
 * EIA Short-Term Energy Outlook (Phase 6). Facet key is `seriesId`
 * (camelCase) -- STEO's own convention, different from the `series` facet
 * key the other fetchers on this page use for other EIA API products. Each
 * series covers roughly a 4-year monthly window (recent actuals plus the
 * forward outlook), so `length` is generous but nowhere near the heavier
 * tables' 2000-2500.
 */
export function fetchSteoTable() {
  return fetchEiaTable({
    route: EIA_ROUTES.steo,
    frequency: "monthly",
    facets: { seriesId: Object.values(EIA_STEO_SERIES) },
    length: 2000,
    revalidate: 21_600,
    timeoutMs: STEO_TIMEOUT_MS
  });
}

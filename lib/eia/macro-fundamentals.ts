import { fetchEiaTable } from "@/lib/eia/client";
import { EIA_FACETS, EIA_ROUTES, EIA_SERIES } from "@/lib/eia/series";

// Each table endpoint gets its own explicit, realistic production timeout
// instead of inheriting fetchEiaTable's generic fallback. These are sized to
// each endpoint's actual payload: regional storage and state production
// request thousands of rows (length 2000/2500) and have been observed to run
// past 8s in production; demand is a lighter request (length 400) but still
// gets headroom above the old global cutoff.
const REGIONAL_STORAGE_TIMEOUT_MS = 25_000;
const STATE_PRODUCTION_TIMEOUT_MS = 25_000;
const DEMAND_TIMEOUT_MS = 20_000;

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

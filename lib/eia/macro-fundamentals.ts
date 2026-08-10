import { fetchEiaTable } from "@/lib/eia/client";
import { EIA_FACETS, EIA_ROUTES, EIA_SERIES } from "@/lib/eia/series";

export function fetchRegionalStorageTable() {
  return fetchEiaTable({
    route: EIA_ROUTES.weeklyStorage,
    frequency: "weekly",
    facets: { series: Object.values(EIA_SERIES.regionalStorage) },
    length: 2000,
    revalidate: 3600
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
    revalidate: 21_600
  });
}

export function fetchDemandTable() {
  return fetchEiaTable({
    route: EIA_ROUTES.consumption,
    frequency: "monthly",
    facets: { series: Object.values(EIA_SERIES.demand) },
    length: 400,
    revalidate: 21_600
  });
}

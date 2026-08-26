import type { ImpactDriverKey } from "@/lib/range-impact-framework";
import { EIA_FACETS, EIA_ROUTES, EIA_SERIES, EIA_STEO_SERIES } from "@/lib/eia/series";

/**
 * Centralized inventory of every EIA data source Macro uses or is verified
 * to be able to use, Phase 6. This is documentation-and-traceability first:
 * it does not replace the existing, already-tested fetch functions in
 * lib/eia/client.ts / lib/eia/macro-fundamentals.ts (each entry below
 * references the same route/series constants those functions already use),
 * it exists so "what EIA data do we use, why, and how fresh is it" has one
 * answer instead of being scattered across call sites.
 *
 * Every entry's `verified` field reflects whether this specific series was
 * confirmed this session to return real data from the live EIA API (not
 * assumed from documentation or a facet-browser listing, which proved
 * unreliable for at least one candidate -- see the comment on
 * EIA_STEO_SERIES in lib/eia/series.ts). Do not flip `verified: true` on an
 * unverified entry without an actual successful fetch.
 */

export type EiaIngestionType = "api_series" | "api_table" | "api_steo";
export type EiaUpdateFrequency = "daily" | "weekly" | "monthly";
export type RangeRelevance = "core" | "supporting" | "context";
export type EiaFreshnessKind = "observation" | "snapshot";

export type EiaSourceDefinition = {
  id: string;
  name: string;
  category: "price" | "storage" | "production" | "demand" | "lng" | "forecast";
  eiaProduct: string;
  route: string;
  /** Single-series fetches (fetchEiaSeriesById-style). */
  seriesId?: string;
  /** Multi-series table fetches (fetchEiaTable-style, one row per series+period). */
  seriesIds?: readonly string[];
  /** Table fetches identified by non-series facets (e.g. product/process for state production) instead of a fixed series ID list -- one of seriesId, seriesIds, or facets must be present. */
  facets?: Record<string, string>;
  ingestionType: EiaIngestionType;
  updateFrequency: EiaUpdateFrequency;
  /** "observation": calculateFreshness() in lib/market/macro-analytics.ts, based on the observed period's own age. "snapshot": calculateSnapshotFreshness() in lib/market/macro-steo.ts, based on when we last fetched (a forecast period's date says nothing about staleness). */
  freshnessKind: EiaFreshnessKind;
  geographicScope: string;
  rangeRelevance: RangeRelevance;
  rangeDrivers: ImpactDriverKey[];
  verified: boolean;
  description: string;
};

export const EIA_MACRO_SOURCE_REGISTRY: EiaSourceDefinition[] = [
  {
    id: "henry-hub-spot",
    name: "Henry Hub Natural Gas Spot Price",
    category: "price",
    eiaProduct: "Natural Gas Spot and Futures Prices (NYMEX)",
    route: "natural-gas/pri/fut/data",
    seriesId: EIA_SERIES.henryHub,
    ingestionType: "api_series",
    updateFrequency: "daily",
    freshnessKind: "observation",
    geographicScope: "National benchmark (Henry Hub, LA)",
    rangeRelevance: "core",
    rangeDrivers: ["gas_pricing"],
    verified: true,
    description: "Daily NYMEX-referenced Henry Hub spot price -- the national natural gas price benchmark Range's realized pricing tracks."
  },
  {
    id: "wti-spot",
    name: "WTI Crude Oil Spot Price",
    category: "price",
    eiaProduct: "Petroleum Spot Prices",
    route: "seriesid",
    seriesId: EIA_SERIES.wti,
    ingestionType: "api_series",
    updateFrequency: "daily",
    freshnessKind: "observation",
    geographicScope: "National benchmark (Cushing, OK)",
    rangeRelevance: "context",
    rangeDrivers: [],
    verified: true,
    description: "Cross-commodity context only -- Range is a dry-gas producer, not an oil producer; carried for the existing Market Pulse tape, not as a Range driver."
  },
  {
    id: "brent-spot",
    name: "Brent Crude Oil Spot Price",
    category: "price",
    eiaProduct: "Petroleum Spot Prices",
    route: "seriesid",
    seriesId: EIA_SERIES.brent,
    ingestionType: "api_series",
    updateFrequency: "daily",
    freshnessKind: "observation",
    geographicScope: "International benchmark (Europe)",
    rangeRelevance: "context",
    rangeDrivers: [],
    verified: true,
    description: "Cross-commodity context only, same reasoning as WTI above."
  },
  {
    id: "lower48-storage",
    name: "Lower-48 Working Gas in Underground Storage",
    category: "storage",
    eiaProduct: "Weekly Natural Gas Storage Report",
    route: EIA_ROUTES.weeklyStorage,
    seriesId: EIA_SERIES.lower48Storage,
    ingestionType: "api_series",
    updateFrequency: "weekly",
    freshnessKind: "observation",
    geographicScope: "Lower 48 states",
    rangeRelevance: "core",
    rangeDrivers: ["storage_levels"],
    verified: true,
    description: "National working-gas storage level, the primary near-term U.S. gas-balance signal."
  },
  {
    id: "regional-storage",
    name: "Regional Working Gas Storage (5 census divisions)",
    category: "storage",
    eiaProduct: "Weekly Natural Gas Storage Report",
    route: EIA_ROUTES.weeklyStorage,
    seriesIds: Object.values(EIA_SERIES.regionalStorage),
    ingestionType: "api_table",
    updateFrequency: "weekly",
    freshnessKind: "observation",
    geographicScope: "East / Midwest / South Central / Mountain / Pacific (EIA census divisions)",
    rangeRelevance: "core",
    rangeDrivers: ["storage_levels", "appalachia_supply"],
    verified: true,
    description: "East region storage is the closest official EIA aggregate to Appalachia, but it is NOT Appalachia -- it spans every state from Maine to Georgia, not just PA/WV/OH. Never relabel this as 'Appalachia storage'; the existing UI already correctly calls it 'East storage'."
  },
  {
    id: "state-marketed-production",
    name: "State Marketed Natural Gas Production",
    category: "production",
    eiaProduct: "Natural Gas Production",
    route: EIA_ROUTES.stateProduction,
    facets: { product: EIA_FACETS.stateMarketedProduction.product, process: EIA_FACETS.stateMarketedProduction.process },
    ingestionType: "api_table",
    updateFrequency: "monthly",
    freshnessKind: "observation",
    geographicScope: "All U.S. states EIA reports (includes PA, WV, OH)",
    rangeRelevance: "core",
    rangeDrivers: ["us_gas_supply", "appalachia_supply"],
    verified: true,
    description: "The precise, state-level basis for Range's Appalachia supply module -- PA/WV/OH specifically, never conflated with the broader 'East' storage region above."
  },
  {
    id: "us-dry-gas-production",
    name: "U.S. Dry Natural Gas Production",
    category: "production",
    eiaProduct: "Natural Gas Production",
    route: "seriesid",
    seriesId: EIA_SERIES.usDryGasProduction,
    ingestionType: "api_series",
    updateFrequency: "monthly",
    freshnessKind: "observation",
    geographicScope: "United States",
    rangeRelevance: "core",
    rangeDrivers: ["us_gas_supply"],
    verified: true,
    description: "National dry-gas production trend -- the broadest U.S. supply signal, independent of any single basin."
  },
  {
    id: "lng-exports",
    name: "U.S. LNG Exports",
    category: "lng",
    eiaProduct: "Natural Gas Imports and Exports",
    route: "seriesid",
    seriesId: EIA_SERIES.lngExports,
    ingestionType: "api_series",
    updateFrequency: "monthly",
    freshnessKind: "observation",
    geographicScope: "United States",
    rangeRelevance: "core",
    rangeDrivers: ["lng_demand"],
    verified: true,
    description: "Observed monthly LNG export volumes -- structural incremental U.S. gas demand."
  },
  {
    id: "demand-by-sector",
    name: "U.S. Natural Gas Consumption by End Use",
    category: "demand",
    eiaProduct: "Natural Gas Consumption",
    route: EIA_ROUTES.consumption,
    seriesIds: Object.values(EIA_SERIES.demand),
    ingestionType: "api_table",
    updateFrequency: "monthly",
    freshnessKind: "observation",
    geographicScope: "United States",
    rangeRelevance: "core",
    rangeDrivers: ["power_data_center_demand", "industrial_demand"],
    verified: true,
    description: "Residential / commercial / industrial / electric-power gas consumption. Electric-power and industrial are core Range drivers; residential/commercial are supporting seasonal-demand context."
  },
  {
    id: "propane-stocks",
    name: "U.S. Propane/NGL Ending Stocks",
    category: "storage",
    eiaProduct: "Weekly Petroleum Status Report",
    route: "seriesid",
    seriesId: EIA_SERIES.propaneStocks,
    ingestionType: "api_series",
    updateFrequency: "weekly",
    freshnessKind: "observation",
    geographicScope: "United States",
    rangeRelevance: "supporting",
    rangeDrivers: ["ngl_demand"],
    verified: true,
    description: "NGL/propane inventory trend, supporting context for Range's NGL realizations."
  },
  {
    id: "steo-henry-hub-forecast",
    name: "STEO Henry Hub Spot Price Forecast",
    category: "forecast",
    eiaProduct: "Short-Term Energy Outlook",
    route: EIA_ROUTES.steo,
    seriesId: EIA_STEO_SERIES.henryHubForecast,
    ingestionType: "api_steo",
    updateFrequency: "monthly",
    freshnessKind: "snapshot",
    geographicScope: "National benchmark",
    rangeRelevance: "core",
    rangeDrivers: ["gas_pricing"],
    verified: true,
    description: "EIA's own ~18-24 month forward Henry Hub projection. Snapshotted monthly (macro_steo_snapshots) so forecast revisions vs. the prior release can be computed."
  },
  {
    id: "steo-dry-gas-production-forecast",
    name: "STEO Dry Gas Production Forecast",
    category: "forecast",
    eiaProduct: "Short-Term Energy Outlook",
    route: EIA_ROUTES.steo,
    seriesId: EIA_STEO_SERIES.dryGasProductionForecast,
    ingestionType: "api_steo",
    updateFrequency: "monthly",
    freshnessKind: "snapshot",
    geographicScope: "United States",
    rangeRelevance: "core",
    rangeDrivers: ["us_gas_supply"],
    verified: true,
    description: "EIA's forward national dry-gas supply projection."
  },
  {
    id: "steo-electric-power-consumption-forecast",
    name: "STEO Electric Power Sector Gas Consumption Forecast",
    category: "forecast",
    eiaProduct: "Short-Term Energy Outlook",
    route: EIA_ROUTES.steo,
    seriesId: EIA_STEO_SERIES.electricPowerConsumptionForecast,
    ingestionType: "api_steo",
    updateFrequency: "monthly",
    freshnessKind: "snapshot",
    geographicScope: "United States",
    rangeRelevance: "core",
    rangeDrivers: ["power_data_center_demand"],
    verified: true,
    description: "EIA's forward power-sector gas demand projection."
  },
  {
    id: "steo-working-gas-storage-forecast",
    name: "STEO Working Gas in Storage Forecast",
    category: "forecast",
    eiaProduct: "Short-Term Energy Outlook",
    route: EIA_ROUTES.steo,
    seriesId: EIA_STEO_SERIES.workingGasStorageForecast,
    ingestionType: "api_steo",
    updateFrequency: "monthly",
    freshnessKind: "snapshot",
    geographicScope: "United States",
    rangeRelevance: "core",
    rangeDrivers: ["storage_levels"],
    verified: true,
    description: "EIA's forward national storage-trajectory projection."
  }
];

export function getEiaMacroSource(id: string): EiaSourceDefinition | undefined {
  return EIA_MACRO_SOURCE_REGISTRY.find((source) => source.id === id);
}

export function getEiaMacroSourcesByDriver(driver: ImpactDriverKey): EiaSourceDefinition[] {
  return EIA_MACRO_SOURCE_REGISTRY.filter((source) => source.rangeDrivers.includes(driver));
}

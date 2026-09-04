export const EIA_ROUTES = {
  weeklyStorage: "natural-gas/stor/wkly/data",
  stateProduction: "natural-gas/prod/sum/data",
  consumption: "natural-gas/cons/sum/data",
  steo: "steo/data"
} as const;

export const EIA_SERIES = {
  henryHub: "RNGWHHD",
  wti: "PET.RWTC.D",
  brent: "PET.RBRTE.D",
  lower48Storage: "NG.NW2_EPG0_SWO_R48_BCF.W",
  lngExports: "NG.N9133US2.M",
  usDryGasProduction: "NG.N9070US2.M",
  propaneStocks: "PET.W_EPLLP0C_SKB_NUS_MBBL.W",
  regionalStorage: {
    east: "NW2_EPG0_SWO_R31_BCF",
    midwest: "NW2_EPG0_SWO_R32_BCF",
    southCentral: "NW2_EPG0_SWO_R33_BCF",
    mountain: "NW2_EPG0_SWO_R34_BCF",
    pacific: "NW2_EPG0_SWO_R35_BCF"
  },
  demand: {
    residential: "N3010US2",
    commercial: "N3020US2",
    industrial: "N3035US2",
    electricPower: "N3045US2"
  }
} as const;

export const EIA_FACETS = {
  stateMarketedProduction: {
    product: "EPG0",
    process: "VGM"
  }
} as const;

/**
 * EIA Short-Term Energy Outlook (route "steo") series IDs. Every one below
 * is verified live against the real EIA v2 API using the real project
 * EIA_API_KEY (not assumed from documentation, and not just a
 * facet-browser listing -- see the Phase 6B/6C notes in
 * docs/CURRENT_HANDOFF.md for how NGICPUS and NGLXPUS, both of which
 * *appeared* in EIA's own facet browser, turned out to return zero data
 * rows when actually queried). The STEO route's facet key is `seriesId`
 * (camelCase) -- notably different from the `series` facet key every other
 * EIA_SERIES entry in this file uses, since STEO is its own EIA API
 * product with its own facet conventions. Naming is also inconsistent
 * within STEO itself: some series end in a plain `US` suffix (NGPRPUS),
 * others in an underscore-separated one (`NGEPCNS_US`, `NGEXPUS_LNG`,
 * `NGINX_US`) -- always confirm the exact id with a real request rather
 * than guessing the pattern.
 *
 * Two real wrong guesses this project made and corrected, kept here as a
 * caution against re-introducing them:
 * - NGICPUS ("industrial consumption") returned zero rows. The real id is
 *   NGINX_US ("U.S. Natural Gas Industrial Consumption").
 * - NGLXPUS ("LNG exports") returned zero rows. The real id is
 *   NGEXPUS_LNG ("Natural Gas LNG Gross Exports"). Separately, NGEXPUS
 *   (no suffix) is a *real*, different series -- "Natural Gas Total Gross
 *   Exports" (pipeline + LNG combined) -- and must never be labeled as an
 *   LNG-specific figure.
 */
export const EIA_STEO_SERIES = {
  henryHubForecast: "NGHHMCF",
  dryGasProductionForecast: "NGPRPUS",
  electricPowerConsumptionForecast: "NGEPCNS_US",
  workingGasStorageForecast: "NGWGPUS",
  lngExportsForecast: "NGEXPUS_LNG",
  totalConsumptionForecast: "NGTCPUS",
  commercialConsumptionForecast: "NGCCPUS",
  residentialConsumptionForecast: "NGRCPUS",
  industrialConsumptionForecast: "NGINX_US"
} as const;

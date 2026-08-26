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
 * EIA Short-Term Energy Outlook (route "steo") series IDs, Phase 6.
 * Verified live against the real EIA v2 API this session (each one
 * independently confirmed to return real data rows with a description and
 * unit, not assumed from documentation). The STEO route's facet key is
 * `seriesId` (camelCase) -- notably different from the `series` facet key
 * every other EIA_SERIES entry in this file uses, since STEO is its own
 * EIA API product with its own facet conventions.
 *
 * Candidates researched but deliberately NOT included here because they
 * could not be verified this session (EIA's public DEMO_KEY tier hit
 * OVER_RATE_LIMIT before confirmation could complete, and one candidate --
 * NGICPUS, industrial consumption -- returned zero data rows despite
 * appearing in EIA's own STEO facet browser): NGLXPUS (LNG gross exports
 * forecast -- high Range relevance, verify first), NGTCPUS (total
 * consumption forecast), NGCCPUS (commercial consumption forecast),
 * NGRCPUS (residential consumption forecast), NGICPUS (industrial
 * consumption forecast, confirmed to return zero rows as queried -- do not
 * re-add without figuring out why). Verify each with a real request before
 * adding to this object; do not assume a facet-browser listing means the
 * data endpoint actually returns rows for it.
 */
export const EIA_STEO_SERIES = {
  henryHubForecast: "NGHHMCF",
  dryGasProductionForecast: "NGPRPUS",
  electricPowerConsumptionForecast: "NGEPCNS_US",
  workingGasStorageForecast: "NGWGPUS"
} as const;

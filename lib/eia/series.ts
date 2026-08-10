export const EIA_ROUTES = {
  weeklyStorage: "natural-gas/stor/wkly/data",
  stateProduction: "natural-gas/prod/sum/data",
  consumption: "natural-gas/cons/sum/data"
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

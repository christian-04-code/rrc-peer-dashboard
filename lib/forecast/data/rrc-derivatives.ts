import type { HedgePosition } from "@/lib/forecast/hedges";

const source = {
  name: "Range Resources Corporation",
  reference: "2026 Q1 Form 10-Q, Note 7 - Derivative Activities",
  period: "As of 2026-03-31",
  retrievedAt: "2026-08-04",
  classification: "reported" as const
};

/**
 * Contract rows disclosed by Range as of March 31, 2026.
 * Volumes are DAILY volumes exactly as presented in the filing. A caller must
 * multiply by the number of covered days before calculating a period settlement.
 */
export const rrcDisclosedCommodityHedges: HedgePosition[] = [
  {
    id: "rrc-gas-swap-apr-dec-2026",
    commodity: "natural_gas",
    instrument: "swap",
    index: "NYMEX Henry Hub",
    startPeriod: "2026-04-01",
    endPeriod: "2026-12-31",
    volume: 300_000,
    volumeUnit: "MMBtu",
    fixedPrice: 4.06,
    source: { ...source, notes: "300,000 MMBtu/day fixed-price swaps." }
  },
  {
    id: "rrc-gas-three-way-apr-dec-2026",
    commodity: "natural_gas",
    instrument: "three_way_collar",
    index: "NYMEX Henry Hub",
    startPeriod: "2026-04-01",
    endPeriod: "2026-12-31",
    volume: 314_091,
    volumeUnit: "MMBtu",
    soldPutPrice: 2.74,
    floorPrice: 3.71,
    ceilingPrice: 5.06,
    source: { ...source, notes: "314,091 MMBtu/day three-way collars." }
  },
  {
    id: "rrc-gas-swap-2027",
    commodity: "natural_gas",
    instrument: "swap",
    index: "NYMEX Henry Hub",
    startPeriod: "2027-01-01",
    endPeriod: "2027-12-31",
    volume: 270_000,
    volumeUnit: "MMBtu",
    fixedPrice: 4.05,
    source: { ...source, notes: "270,000 MMBtu/day fixed-price swaps." }
  },
  {
    id: "rrc-gas-three-way-2027",
    commodity: "natural_gas",
    instrument: "three_way_collar",
    index: "NYMEX Henry Hub",
    startPeriod: "2027-01-01",
    endPeriod: "2027-12-31",
    volume: 80_000,
    volumeUnit: "MMBtu",
    soldPutPrice: 3.0,
    floorPrice: 4.0,
    ceilingPrice: 4.75,
    source: { ...source, notes: "80,000 MMBtu/day three-way collars." }
  },
  {
    id: "rrc-gas-collar-2028",
    commodity: "natural_gas",
    instrument: "collar",
    index: "NYMEX Henry Hub",
    startPeriod: "2028-01-01",
    endPeriod: "2028-12-31",
    volume: 20_000,
    volumeUnit: "MMBtu",
    floorPrice: 3.5,
    ceilingPrice: 4.5,
    source: { ...source, notes: "20,000 MMBtu/day collars." }
  },
  {
    id: "rrc-oil-three-way-apr-sep-2026",
    commodity: "oil",
    instrument: "three_way_collar",
    index: "WTI",
    startPeriod: "2026-04-01",
    endPeriod: "2026-09-30",
    volume: 5_331,
    volumeUnit: "bbl",
    soldPutPrice: 52.36,
    floorPrice: 62.42,
    ceilingPrice: 75.18,
    source: { ...source, notes: "5,331 bbl/day oil three-way collars." }
  },
  {
    id: "rrc-c3-swap-apr-sep-2026",
    commodity: "ngl",
    instrument: "swap",
    index: "C3 propane",
    startPeriod: "2026-04-01",
    endPeriod: "2026-09-30",
    volume: 4_000,
    volumeUnit: "bbl",
    fixedPrice: 31.4,
    source: { ...source, notes: "4,000 bbl/day C3 swaps." }
  },
  {
    id: "rrc-c5-swap-apr-jun-2026",
    commodity: "ngl",
    instrument: "swap",
    index: "C5 natural gasoline",
    startPeriod: "2026-04-01",
    endPeriod: "2026-06-30",
    volume: 4_670,
    volumeUnit: "bbl",
    fixedPrice: 67.27,
    source: { ...source, notes: "4,670 bbl/day C5 swaps." }
  }
];

export const rrcNaturalGasSwaptions = [
  {
    period: "2026-H2",
    volumeMmbtuPerDay: 40_000,
    strikePerMmbtu: 4.25,
    expiry: "2026-06",
    status: "not_assumed_exercised" as const
  },
  {
    period: "2027",
    volumeMmbtuPerDay: 100_000,
    strikePerMmbtu: 4.0,
    expiry: "2026-Q2",
    status: "not_assumed_exercised" as const
  }
];

export const rrcBasisSwapDisclosure = {
  totalVolumeMmbtu: 153_762_500,
  settlesThrough: "2030-12-31",
  fairValueMillion: -12.8,
  positionLevelPricesAvailable: false,
  notes:
    "The filing discloses aggregate basis-swap volume and fair value but not the contract-by-contract fixed basis needed to calculate future settlements."
} as const;

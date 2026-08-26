/**
 * Range Impact Engine scaffold. Deliberately plain, version-controlled TS
 * constants rather than a database table -- every change to how a driver is
 * described is a reviewable diff, and the framework can be imported directly
 * by both AI prompt-construction code and by tests asserting the taxonomy
 * stays internally consistent.
 *
 * This file describes *potential directional relationships*, never
 * guaranteed outcomes or trading signals. An AI layer selects among these
 * drivers and directions; it must not invent new ones.
 *
 * Shared, domain-neutral home for the Range driver taxonomy (moved here from
 * lib/news/impact-framework.ts during Phase 6 so the Macro EIA intelligence
 * system can map its own deterministic signals to the same driver names
 * instead of inventing conflicting terminology). Only this taxonomy is
 * shared -- News keeps its own relevance/AI/persistence/UI code entirely
 * separate from Macro's own ingestion/scoring/AI/persistence/UI code.
 *
 * News's AI layer (lib/news/ai/) intentionally restricts itself to the
 * original 8 driver keys below (see NEWS_DRIVER_KEYS in
 * lib/news/ai/relevant-drivers.ts) rather than this file's full set, so
 * adding a Macro-only key here can never change what News sends to or
 * accepts from its own AI provider.
 */

export const IMPACT_FRAMEWORK_VERSION = "1.0.0";

export type ImpactDriverKey =
  | "gas_pricing"
  | "lng_demand"
  | "appalachian_takeaway"
  | "gas_rig_activity"
  | "storage_levels"
  | "power_data_center_demand"
  | "ngl_demand"
  | "regulation"
  | "us_gas_supply"
  | "appalachia_supply"
  | "industrial_demand"
  | "weather";

export type ImpactDriverDefinition = {
  key: ImpactDriverKey;
  label: string;
  description: string;
  potentialPositiveEffect: string;
  potentialNegativeEffect: string;
  relatedMetrics: string[];
};

export const IMPACT_DRIVERS: Record<ImpactDriverKey, ImpactDriverDefinition> = {
  gas_pricing: {
    key: "gas_pricing",
    label: "Natural Gas Pricing",
    description: "Henry Hub / regional realized natural gas prices.",
    potentialPositiveEffect: "Higher realizations may support revenue, EBITDAX, operating cash flow, and free cash flow.",
    potentialNegativeEffect: "Lower realizations may pressure revenue, EBITDAX, operating cash flow, and free cash flow.",
    relatedMetrics: ["revenue", "ebitdax", "operating_cash_flow", "free_cash_flow"]
  },
  lng_demand: {
    key: "lng_demand",
    label: "LNG Feedgas / Export Demand",
    description: "U.S. LNG feedgas demand and export capacity.",
    potentialPositiveEffect: "Higher LNG feedgas demand may increase U.S. natural gas demand, tighten domestic balances, and support gas pricing.",
    potentialNegativeEffect: "LNG demand or capacity shortfalls may loosen domestic balances and pressure gas pricing.",
    relatedMetrics: ["gas_pricing", "domestic_balances"]
  },
  appalachian_takeaway: {
    key: "appalachian_takeaway",
    label: "Appalachian Takeaway Capacity",
    description: "Pipeline capacity available to move Appalachian gas to market.",
    potentialPositiveEffect: "More takeaway capacity may reduce regional constraints and improve basis differentials and realized pricing.",
    potentialNegativeEffect: "Pipeline constraints may widen negative basis differentials and pressure realized pricing.",
    relatedMetrics: ["basis_differential", "realized_pricing"]
  },
  gas_rig_activity: {
    key: "gas_rig_activity",
    label: "Gas-Directed Rig Activity",
    description: "Gas-directed drilling activity across U.S. basins.",
    potentialPositiveEffect: "Lower gas-directed activity may constrain future supply growth, a potential support for future pricing.",
    potentialNegativeEffect: "Higher gas-directed activity may increase future supply, a potential pressure on future gas prices.",
    relatedMetrics: ["future_supply", "gas_pricing"]
  },
  storage_levels: {
    key: "storage_levels",
    label: "Natural Gas Storage Levels",
    description: "Working gas in underground storage relative to the 5-year normal range.",
    potentialPositiveEffect: "Low storage relative to normal may support near-term gas pricing.",
    potentialNegativeEffect: "High storage relative to normal may pressure near-term gas pricing.",
    relatedMetrics: ["gas_pricing"]
  },
  power_data_center_demand: {
    key: "power_data_center_demand",
    label: "Power / Data Center Demand",
    description: "PJM and broader regional electricity demand, including data-center and industrial load growth.",
    potentialPositiveEffect:
      "Higher PJM / data-center / industrial power demand may increase regional electricity demand, potentially increasing natural-gas-fired generation and improving long-term Appalachian gas demand.",
    potentialNegativeEffect: "Slower power demand growth or accelerated non-gas generation buildout may reduce incremental gas-fired demand.",
    relatedMetrics: ["long_term_demand"]
  },
  ngl_demand: {
    key: "ngl_demand",
    label: "NGL / Petrochemical Demand",
    description: "Propane, ethane, and broader NGL export and petrochemical demand.",
    potentialPositiveEffect: "Higher propane/ethane/LPG export demand may tighten domestic NGL balances and potentially support NGL realizations.",
    potentialNegativeEffect: "Weaker export or petrochemical demand may loosen domestic NGL balances and pressure NGL realizations.",
    relatedMetrics: ["ngl_realizations"]
  },
  regulation: {
    key: "regulation",
    label: "Regulation / Permitting",
    description: "FERC, EPA, methane, and state-level permitting and environmental regulation.",
    potentialPositiveEffect: "Streamlined permitting or favorable pipeline approvals may support capital spending efficiency and production economics.",
    potentialNegativeEffect: "More restrictive regulation may increase operating costs, capital spending, or permitting timelines.",
    relatedMetrics: ["operating_costs", "capital_spending", "permitting_timeline"]
  },
  us_gas_supply: {
    key: "us_gas_supply",
    label: "U.S. Lower-48 Gas Supply",
    description: "Aggregate U.S. dry natural gas production and its trend, independent of any single basin.",
    potentialPositiveEffect: "Slower national supply growth (or declines) may tighten the broader U.S. balance and support gas pricing.",
    potentialNegativeEffect: "Accelerating national supply growth may loosen the broader U.S. balance and pressure gas pricing.",
    relatedMetrics: ["gas_pricing", "storage_levels"]
  },
  appalachia_supply: {
    key: "appalachia_supply",
    label: "Appalachia Basin Supply",
    description: "Marketed natural gas production growth/decline specifically in Range's core Appalachian states (Pennsylvania, West Virginia, Ohio).",
    potentialPositiveEffect: "Slowing Appalachian supply growth may ease regional competition for takeaway capacity and support realized basis.",
    potentialNegativeEffect: "Accelerating Appalachian supply growth may increase regional competition for takeaway capacity and pressure realized basis.",
    relatedMetrics: ["appalachian_takeaway", "realized_pricing"]
  },
  industrial_demand: {
    key: "industrial_demand",
    label: "Industrial Natural Gas Demand",
    description: "Natural gas consumed by the U.S. industrial sector (manufacturing, chemicals, reshoring-linked demand).",
    potentialPositiveEffect: "Growing industrial gas demand may tighten domestic balances and support gas pricing.",
    potentialNegativeEffect: "Weakening industrial gas demand may loosen domestic balances and pressure gas pricing.",
    relatedMetrics: ["gas_pricing"]
  },
  weather: {
    key: "weather",
    label: "Weather-Driven Demand",
    description: "Heating and cooling degree days relative to normal, as a near-term driver of residential/commercial gas and power-sector gas demand.",
    potentialPositiveEffect: "Colder-than-normal or hotter-than-normal weather may increase near-term gas demand and support prices.",
    potentialNegativeEffect: "Milder-than-normal weather may reduce near-term gas demand and pressure prices.",
    relatedMetrics: ["gas_pricing", "storage_levels"]
  }
};

export function getImpactDriver(key: ImpactDriverKey): ImpactDriverDefinition {
  return IMPACT_DRIVERS[key];
}

export function isImpactDriverKey(value: string): value is ImpactDriverKey {
  return value in IMPACT_DRIVERS;
}

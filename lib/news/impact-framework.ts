/**
 * Range Impact Engine scaffold. Deliberately plain, version-controlled TS
 * constants rather than a database table -- every change to how a driver is
 * described is a reviewable diff, and the framework can be imported directly
 * by both the (future, Phase 3) AI prompt-construction code and by tests
 * asserting the taxonomy stays internally consistent.
 *
 * This file describes *potential directional relationships*, never
 * guaranteed outcomes or trading signals. Phase 3's AI layer selects among
 * these drivers and directions; it must not invent new ones.
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
  | "regulation";

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
  }
};

export function getImpactDriver(key: ImpactDriverKey): ImpactDriverDefinition {
  return IMPACT_DRIVERS[key];
}

export function isImpactDriverKey(value: string): value is ImpactDriverKey {
  return value in IMPACT_DRIVERS;
}

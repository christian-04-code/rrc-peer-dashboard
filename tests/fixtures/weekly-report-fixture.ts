import type { WeeklyAnalystAssessment } from "@/lib/reports/ai-contract";
import type { WeeklyEvidenceItem, WeeklyReportPayload } from "@/lib/reports/weekly-report-types";

/**
 * A realistic, hand-authored, fully deterministic Phase 7 fixture -- one
 * frozen WeeklyReportPayload + its matching persisted WeeklyAnalystAssessment
 * -- used by (a) Phase 7D's render-model/table/chart/pdf-service unit tests
 * and (b) the local visual-QA PDF preview (see scripts/reports/README or the
 * session notes for how it was used; the preview script itself is not
 * committed -- this fixture is the reusable, permanent artifact of that
 * exercise). Every numeric value below is invented fixture data for testing
 * purposes only -- never real Range Resources financial or market data, and
 * never used by any live code path.
 */

function item(overrides: Partial<WeeklyEvidenceItem> & Pick<WeeklyEvidenceItem, "evidenceId" | "category" | "metricKey" | "label" | "currentValue" | "displayValue">): WeeklyEvidenceItem {
  return {
    unit: null,
    period: null,
    asOfDate: null,
    sourceIds: [],
    freshness: "current",
    comparisons: [],
    rangeDrivers: [],
    materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
    metadata: {},
    ...overrides
  };
}

export const SAMPLE_WEEKLY_REPORT_PAYLOAD: WeeklyReportPayload = {
  schemaVersion: "1.0.0",
  storageWeekEnding: "2026-08-28",
  dataCutoffAt: "2026-09-03T18:00:00.000Z",
  modules: {
    gas_pricing: [
      item({
        evidenceId: "gas_pricing:henry_hub_spot",
        category: "gas_pricing",
        metricKey: "henry_hub_spot",
        label: "Henry Hub Spot Price",
        currentValue: 3.42,
        displayValue: "$3.42/MMBtu",
        unit: "$/MMBtu",
        period: "2026-08-28",
        asOfDate: "2026-08-28",
        sourceIds: ["macro_henry_hub"],
        rangeDrivers: ["gas_pricing"],
        comparisons: [{ period: "WoW", metricKey: "henry_hub_spot", label: "Henry Hub Spot Price", currentValue: 3.42, previousValue: 3.21, delta: 0.21, deltaPct: 6.5, direction: "up", basisDescription: "vs. 2026-08-21" }],
        materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: true, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 6.5 }
      })
    ],
    storage: [
      item({
        evidenceId: "storage:lower48",
        category: "storage",
        metricKey: "lower48_storage",
        label: "Lower 48 Working Gas Storage",
        currentValue: 3212,
        displayValue: "3,212 Bcf",
        unit: "Bcf",
        period: "2026-08-28",
        asOfDate: "2026-08-28",
        sourceIds: ["macro_storage"],
        rangeDrivers: ["storage_levels"],
        comparisons: [
          { period: "WoW", metricKey: "lower48_storage", label: "Lower 48 Working Gas Storage", currentValue: 3212, previousValue: 3178, delta: 34, deltaPct: 1.07, direction: "up", basisDescription: "vs. week ending 2026-08-21" },
          { period: "YoY", metricKey: "lower48_storage", label: "Lower 48 Working Gas Storage", currentValue: 3212, previousValue: 3050, delta: 162, deltaPct: 5.3, direction: "up", basisDescription: "vs. same week one year earlier" },
          { period: "vs5yrAvg", metricKey: "lower48_storage", label: "Lower 48 Working Gas Storage", currentValue: 3212, previousValue: 3040, delta: 172, deltaPct: 5.66, direction: "up", basisDescription: "vs. trailing 5-year average for this reporting week" }
        ],
        materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: true, riskSeverityRank: 1, riskState: "MODERATE_RISK", rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 5.66 }
      })
    ],
    us_gas_supply: [
      item({
        evidenceId: "us_gas_supply:dry_gas_production",
        category: "us_gas_supply",
        metricKey: "dry_gas_production",
        label: "U.S. Dry Gas Production",
        currentValue: 3120000,
        displayValue: "3,120,000 MMcf/mo",
        unit: "MMcf/month",
        period: "2026-07",
        asOfDate: "2026-07",
        sourceIds: ["macro_dry_gas_production"],
        rangeDrivers: ["us_gas_supply"],
        comparisons: [{ period: "YoY", metricKey: "dry_gas_production", label: "U.S. Dry Gas Production", currentValue: 3120000, previousValue: 2990000, delta: 130000, deltaPct: 4.3, direction: "up", basisDescription: "vs. 2025-07" }],
        materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 4.3 }
      })
    ],
    appalachia_supply: [
      item({
        evidenceId: "appalachia_supply:pa_wv_oh_marketed_production",
        category: "appalachia_supply",
        metricKey: "pa_wv_oh_marketed_production",
        label: "PA + WV + OH Marketed Production",
        currentValue: 985000,
        displayValue: "985,000 MMcf/mo",
        unit: "MMcf/month",
        period: "2026-07",
        asOfDate: "2026-07",
        sourceIds: ["macro_appalachia_production"],
        rangeDrivers: ["appalachia_supply"],
        comparisons: [{ period: "YoY", metricKey: "pa_wv_oh_marketed_production", label: "PA + WV + OH Marketed Production", currentValue: 985000, previousValue: 960000, delta: 25000, deltaPct: 2.6, direction: "up", basisDescription: "vs. 2025-07" }],
        materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 2.6 }
      })
    ],
    lng_demand: [
      item({
        evidenceId: "lng_demand:us_lng_exports",
        category: "lng_demand",
        metricKey: "us_lng_exports",
        label: "U.S. LNG Exports",
        currentValue: 462000,
        displayValue: "462,000 MMcf/mo",
        unit: "MMcf/month",
        period: "2026-07",
        asOfDate: "2026-07",
        sourceIds: ["macro_lng_exports"],
        rangeDrivers: ["lng_demand"],
        comparisons: [{ period: "YoY", metricKey: "us_lng_exports", label: "U.S. LNG Exports", currentValue: 462000, previousValue: 398000, delta: 64000, deltaPct: 16.1, direction: "up", basisDescription: "vs. 2025-07" }],
        materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: true, riskSeverityRank: 2, riskState: "SUPPORTIVE", rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 16.1 }
      })
    ],
    power_data_center_demand: [
      item({
        evidenceId: "power_data_center_demand:electric_power_gas_demand",
        category: "power_data_center_demand",
        metricKey: "electric_power_gas_demand",
        label: "Electric Power Sector Gas Demand",
        currentValue: 1020000,
        displayValue: "1,020,000 MMcf/mo",
        unit: "MMcf/month",
        period: "2026-07",
        asOfDate: "2026-07",
        sourceIds: ["macro_power_demand"],
        rangeDrivers: ["power_data_center_demand"],
        comparisons: [{ period: "YoY", metricKey: "electric_power_gas_demand", label: "Electric Power Sector Gas Demand", currentValue: 1020000, previousValue: 970000, delta: 50000, deltaPct: 5.2, direction: "up", basisDescription: "vs. 2025-07" }],
        materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 5.2 }
      })
    ],
    industrial_demand: [
      item({
        evidenceId: "industrial_demand:industrial_gas_demand",
        category: "industrial_demand",
        metricKey: "industrial_gas_demand",
        label: "Industrial Gas Demand",
        currentValue: 780000,
        displayValue: "780,000 MMcf/mo",
        unit: "MMcf/month",
        period: "2026-07",
        asOfDate: "2026-07",
        sourceIds: ["macro_industrial_demand"],
        rangeDrivers: ["industrial_demand"],
        comparisons: [{ period: "YoY", metricKey: "industrial_gas_demand", label: "Industrial Gas Demand", currentValue: 780000, previousValue: 775000, delta: 5000, deltaPct: 0.6, direction: "up", basisDescription: "vs. 2025-07" }],
        materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 0.6 }
      })
    ],
    rigs: [
      item({
        evidenceId: "rigs:national_us",
        category: "rigs",
        metricKey: "national_us",
        label: "U.S. Rig Count",
        currentValue: 588,
        displayValue: "588 rigs",
        unit: "rigs",
        period: "2026-08-29",
        asOfDate: "2026-08-29",
        sourceIds: ["rigs_baker_hughes"],
        rangeDrivers: ["us_gas_supply"],
        comparisons: [{ period: "WoW", metricKey: "national_us", label: "U.S. Rig Count", currentValue: 588, previousValue: 583, delta: 5, deltaPct: 0.9, direction: "up", basisDescription: "vs. prior published Baker Hughes week" }]
      }),
      item({
        evidenceId: "rigs:basin_marcellus",
        category: "rigs",
        metricKey: "basin_marcellus",
        label: "Marcellus Rig Count",
        currentValue: 34,
        displayValue: "34 rigs",
        unit: "rigs",
        period: "2026-08-29",
        asOfDate: "2026-08-29",
        sourceIds: ["rigs_baker_hughes"],
        rangeDrivers: ["appalachia_supply"],
        comparisons: [{ period: "WoW", metricKey: "basin_marcellus", label: "Marcellus Rig Count", currentValue: 34, previousValue: 33, delta: 1, deltaPct: 3.0, direction: "up", basisDescription: "vs. prior published Baker Hughes week" }]
      }),
      item({
        evidenceId: "rigs:basin_utica",
        category: "rigs",
        metricKey: "basin_utica",
        label: "Utica Rig Count",
        currentValue: 12,
        displayValue: "12 rigs",
        unit: "rigs",
        period: "2026-08-29",
        asOfDate: "2026-08-29",
        sourceIds: ["rigs_baker_hughes"],
        rangeDrivers: ["appalachia_supply"],
        comparisons: [{ period: "WoW", metricKey: "basin_utica", label: "Utica Rig Count", currentValue: 12, previousValue: 12, delta: 0, deltaPct: 0, direction: "flat", basisDescription: "vs. prior published Baker Hughes week" }]
      })
    ],
    steo_outlook: [
      item({
        evidenceId: "steo_outlook:henryHubForecast",
        category: "steo_outlook",
        metricKey: "henryHubForecast",
        label: "Henry Hub Spot Price Forecast",
        currentValue: 3.65,
        displayValue: "$3.65/MMBtu",
        unit: "$/MMBtu",
        period: "2026-10",
        asOfDate: "2026-10",
        sourceIds: ["steo_outlook"],
        comparisons: [{ period: "steoVintage", metricKey: "henryHubForecast:2026-10", label: "Henry Hub Spot Price Forecast (2026-10)", currentValue: 3.65, previousValue: 3.55, delta: 0.1, deltaPct: 2.8, direction: "up", basisDescription: "2026-08 vintage vs. 2026-09 vintage" }],
        materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: true, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 2.8 }
      }),
      item({
        evidenceId: "steo_outlook:lngExportsForecast",
        category: "steo_outlook",
        metricKey: "lngExportsForecast",
        label: "U.S. LNG Exports Forecast",
        currentValue: 495000,
        displayValue: "495,000 MMcf/mo",
        unit: "MMcf/month",
        period: "2026-10",
        asOfDate: "2026-10",
        sourceIds: ["steo_outlook"]
      })
    ],
    range_company: [
      item({
        evidenceId: "range_company:rrc:revenue",
        category: "range_company",
        metricKey: "revenue",
        label: "RRC Revenue",
        currentValue: 512,
        displayValue: "$512MM",
        unit: "$MM",
        period: "Q2 2026",
        asOfDate: "2026-06-30",
        sourceIds: ["range_company_financials"],
        rangeDrivers: ["gas_pricing"],
        comparisons: [{ period: "QoQ", metricKey: "revenue", label: "RRC Revenue", currentValue: 512, previousValue: 478, delta: 34, deltaPct: 7.1, direction: "up", basisDescription: "vs. Q1 2026" }],
        materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 7.1 }
      }),
      item({
        evidenceId: "range_company:rrc:adjusted_ebitdax",
        category: "range_company",
        metricKey: "adjusted_ebitdax",
        label: "RRC Adjusted EBITDAX",
        currentValue: 305,
        displayValue: "$305MM",
        unit: "$MM",
        period: "Q2 2026",
        asOfDate: "2026-06-30",
        sourceIds: ["range_company_financials"],
        comparisons: [{ period: "QoQ", metricKey: "adjusted_ebitdax", label: "RRC Adjusted EBITDAX", currentValue: 305, previousValue: 287, delta: 18, deltaPct: 6.3, direction: "up", basisDescription: "vs. Q1 2026" }]
      }),
      item({
        evidenceId: "range_company:rrc:free_cash_flow",
        category: "range_company",
        metricKey: "free_cash_flow",
        label: "RRC Free Cash Flow",
        currentValue: 96,
        displayValue: "$96MM",
        unit: "$MM",
        period: "Q2 2026",
        asOfDate: "2026-06-30",
        sourceIds: ["range_company_financials"],
        comparisons: [{ period: "QoQ", metricKey: "free_cash_flow", label: "RRC Free Cash Flow", currentValue: 96, previousValue: 81, delta: 15, deltaPct: 18.5, direction: "up", basisDescription: "vs. Q1 2026" }]
      }),
      item({
        evidenceId: "range_company:guidance:RRC:capital_expenditures:2026",
        category: "range_company",
        metricKey: "guidance:capital_expenditures",
        label: "RRC Guidance: capital_expenditures (2026)",
        currentValue: 620,
        displayValue: "600-640 $MM",
        unit: "$MM",
        period: "2026",
        asOfDate: "2026-07-24",
        sourceIds: ["range_company_guidance"]
      })
    ],
    peers: [
      item({ evidenceId: "peers:AR:revenue", category: "peers", metricKey: "revenue", label: "AR Revenue", currentValue: 690, displayValue: "$690MM", unit: "$MM", period: "Q2 2026", sourceIds: ["peer_financials"], metadata: { ticker: "AR" } }),
      item({ evidenceId: "peers:EQT:revenue", category: "peers", metricKey: "revenue", label: "EQT Revenue", currentValue: 1450, displayValue: "$1,450MM", unit: "$MM", period: "Q2 2026", sourceIds: ["peer_financials"], metadata: { ticker: "EQT" } }),
      item({ evidenceId: "peers:CNX:revenue", category: "peers", metricKey: "revenue", label: "CNX Revenue", currentValue: 480, displayValue: "$480MM", unit: "$MM", period: "Q2 2026", sourceIds: ["peer_financials"], metadata: { ticker: "CNX" } }),
      item({ evidenceId: "peers:CRK:revenue", category: "peers", metricKey: "revenue", label: "CRK Revenue", currentValue: 410, displayValue: "$410MM", unit: "$MM", period: "Q2 2026", sourceIds: ["peer_financials"], metadata: { ticker: "CRK" } }),
      item({ evidenceId: "peers:EXE:revenue", category: "peers", metricKey: "revenue", label: "EXE Revenue", currentValue: 1980, displayValue: "$1,980MM", unit: "$MM", period: "Q2 2026", sourceIds: ["peer_financials"], metadata: { ticker: "EXE" } }),
      item({ evidenceId: "peers:GPOR:revenue", category: "peers", metricKey: "revenue", label: "GPOR Revenue", currentValue: 205, displayValue: "$205MM", unit: "$MM", period: "Q2 2026", sourceIds: ["peer_financials"], metadata: { ticker: "GPOR" } }),
      item({ evidenceId: "peers:AR:ebitdax", category: "peers", metricKey: "ebitdax", label: "AR Adjusted EBITDAX", currentValue: 420, displayValue: "$420MM", unit: "$MM", period: "Q2 2026", sourceIds: ["peer_financials"], metadata: { ticker: "AR" } }),
      item({ evidenceId: "peers:EQT:ebitdax", category: "peers", metricKey: "ebitdax", label: "EQT Adjusted EBITDAX", currentValue: 890, displayValue: "$890MM", unit: "$MM", period: "Q2 2026", sourceIds: ["peer_financials"], metadata: { ticker: "EQT" } })
    ],
    forecast_scenarios: [
      item({
        evidenceId: "forecast_scenarios:rrc:default_scenario_revenue",
        category: "forecast_scenarios",
        metricKey: "default_scenario_revenue",
        label: "RRC Default-Scenario Forecast Revenue (2027)",
        currentValue: 560,
        displayValue: "$560MM",
        unit: "$MM",
        period: "2027",
        sourceIds: ["forecast_scenarios"]
      }),
      item({
        evidenceId: "forecast_scenarios:rrc:default_scenario_fcf",
        category: "forecast_scenarios",
        metricKey: "default_scenario_fcf",
        label: "RRC Default-Scenario Forecast Free Cash Flow (2027)",
        currentValue: 140,
        displayValue: "$140MM",
        unit: "$MM",
        period: "2027",
        sourceIds: ["forecast_scenarios"]
      })
    ],
    news: [
      item({
        evidenceId: "news:article:1001",
        category: "news",
        metricKey: "article",
        label: "EQT announces incremental Appalachian gathering capacity expansion",
        currentValue: null,
        displayValue: "Moderate positive Range impact",
        period: "2026-08-30T14:00:00.000Z",
        asOfDate: "2026-08-30",
        sourceIds: ["news_articles"],
        rangeDrivers: ["appalachia_supply"],
        materialityInputs: { isNewThisWeek: true, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: "positive", rangeImpactStrength: "moderate", comparisonMagnitudePct: null }
      }),
      item({
        evidenceId: "news:article:1002",
        category: "news",
        metricKey: "article",
        label: "New England pipeline expansion clears a key permitting milestone",
        currentValue: null,
        displayValue: "High positive Range impact",
        period: "2026-08-29T09:00:00.000Z",
        asOfDate: "2026-08-29",
        sourceIds: ["news_articles"],
        rangeDrivers: ["lng_demand"],
        materialityInputs: { isNewThisWeek: true, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: "positive", rangeImpactStrength: "high", comparisonMagnitudePct: null }
      })
    ],
    deterministic_risk_opportunity: [
      item({
        evidenceId: "deterministic_risk_opportunity:storage_levels",
        category: "deterministic_risk_opportunity",
        metricKey: "storage_levels",
        label: "Storage",
        currentValue: 5.66,
        displayValue: "MODERATE_RISK",
        unit: "%",
        period: "2026-08-28",
        sourceIds: ["storage:lower48"],
        materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: 1, riskState: "MODERATE_RISK", rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 5.66 },
        metadata: { riskRank: 1, riskState: "MODERATE_RISK", deterministicReason: "Storage sits 5.7% above the trailing five-year average for this reporting week, a supply overhang that historically pressures near-term Henry Hub pricing." }
      }),
      item({
        evidenceId: "deterministic_risk_opportunity:lng_demand",
        category: "deterministic_risk_opportunity",
        metricKey: "lng_demand",
        label: "LNG Demand",
        currentValue: 16.1,
        displayValue: "SUPPORTIVE",
        unit: "%",
        period: "2026-07",
        sourceIds: ["lng_demand:us_lng_exports"],
        materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: 2, riskState: "SUPPORTIVE", rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 16.1 },
        metadata: { riskRank: 2, riskState: "SUPPORTIVE", deterministicReason: "U.S. LNG exports are up 16.1% year over year, adding incremental demand pull that supports domestic gas pricing." }
      }),
      item({
        evidenceId: "deterministic_risk_opportunity:gas_pricing",
        category: "deterministic_risk_opportunity",
        metricKey: "gas_pricing",
        label: "Gas Pricing",
        currentValue: 6.5,
        displayValue: "WATCH",
        unit: "%",
        period: "2026-08-28",
        sourceIds: ["gas_pricing:henry_hub_spot"],
        materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: 3, riskState: "WATCH", rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: 6.5 },
        metadata: { riskRank: 3, riskState: "WATCH", deterministicReason: "Henry Hub spot rose 6.5% week over week; worth monitoring for follow-through." }
      })
    ]
  },
  sourceManifest: {
    generatedFrom: [
      { key: "macro_henry_hub", label: "EIA Henry Hub daily spot price", period: "2026-08-28", freshness: "current", included: true },
      { key: "macro_storage", label: "EIA Weekly Natural Gas Storage Report (Lower 48)", period: "2026-08-28", freshness: "current", included: true },
      { key: "macro_dry_gas_production", label: "EIA U.S. dry gas production", period: "2026-07", freshness: "current", included: true },
      { key: "macro_appalachia_production", label: "EIA PA + WV + OH marketed production", period: "2026-07", freshness: "current", included: true },
      { key: "macro_lng_exports", label: "EIA U.S. LNG exports", period: "2026-07", freshness: "current", included: true },
      { key: "macro_power_demand", label: "EIA electric power sector gas demand", period: "2026-07", freshness: "current", included: true },
      { key: "macro_industrial_demand", label: "EIA industrial gas demand", period: "2026-07", freshness: "current", included: true },
      { key: "steo_outlook", label: "EIA Short-Term Energy Outlook (STEO)", period: "2026-10", freshness: "current", included: true },
      { key: "rigs_baker_hughes", label: "Baker Hughes North America rig count", period: "2026-08-29", freshness: "current", included: true },
      { key: "range_company_financials", label: "RRC quarterly financials (Codex/FactSet/SEC-direct extraction)", period: "Q2 2026", freshness: "current", included: true },
      { key: "range_company_guidance", label: "RRC management guidance", period: "2026", freshness: "current", included: true },
      { key: "peer_financials", label: "Peer quarterly financials (Codex/FactSet/SEC-direct extraction)", period: "Q2 2026", freshness: "current", included: true },
      { key: "forecast_scenarios", label: "RRC default-scenario forecast model", period: "2027", freshness: "current", included: true },
      { key: "news_articles", label: "Retained/analyzed News articles", period: "(2026-08-26, 2026-09-03]", freshness: "current", included: true }
    ]
  }
};

export const SAMPLE_WEEKLY_ANALYST_ASSESSMENT: WeeklyAnalystAssessment = {
  schemaVersion: "1.1.0",
  aiProvider: "fake",
  aiModel: "fake-model",
  generatedAt: "2026-09-03T19:05:00.000Z",
  executiveAssessment: `Natural gas storage built to 3,212 Bcf, now 5.7% above the trailing five-year average, while Henry Hub spot still rose 6.5% week over week to $3.42/MMBtu on firmer late-summer demand. LNG exports remain the clearest structural tailwind, up 16.1% year over year, and EQT's Appalachian gathering-capacity expansion plus a cleared New England pipeline permitting milestone both point to improving regional takeaway over the next several quarters.

For Range, the setup is constructive on the demand side but not yet decisive: the storage surplus is a real overhang that could cap near-term pricing upside if it persists into shoulder season, even as LNG pull and improving regional infrastructure support the medium-term basis outlook. RRC's own Q2 results (revenue up 7.1% QoQ, free cash flow up 18.5% QoQ) reflect the stronger realized-price environment already flowing through.

Management should watch whether the next several EIA storage releases continue narrowing the five-year surplus, and whether the Appalachian rig count (now ticking higher WoW) signals a supply response that could offset the LNG-driven demand tailwind.`,
  biggestRisk: {
    title: "Storage surplus above the five-year average",
    assessment: "Storage sits 5.7% above its trailing five-year average for this reporting week, a supply overhang that has historically pressured near-term Henry Hub pricing even as spot ticked higher this week.",
    evidenceIds: ["deterministic_risk_opportunity:storage_levels", "storage:lower48"]
  },
  biggestOpportunity: {
    title: "LNG export growth continues to tighten the demand side",
    assessment: "U.S. LNG exports are up 16.1% year over year, and this week's EQT gathering-capacity and New England pipeline permitting news both point to further regional takeaway improvement that should keep supporting realized pricing.",
    evidenceIds: ["deterministic_risk_opportunity:lng_demand", "news:article:1001", "news:article:1002"]
  },
  whatChanged: [
    {
      title: "Storage build extended the five-year surplus",
      assessment: "A 34 Bcf weekly build pushed storage to 5.7% above its five-year average, up from a smaller surplus the prior week.",
      evidenceIds: ["storage:lower48"]
    },
    {
      title: "STEO raised its near-term Henry Hub forecast",
      assessment: "The latest STEO vintage revised the near-term Henry Hub forecast up 2.8% from the prior vintage.",
      evidenceIds: ["steo_outlook:henryHubForecast"]
    }
  ],
  managementWatchItems: [
    { item: "Watch the next several EIA storage releases", reason: "Confirms whether the surplus versus the five-year average continues narrowing or persists into shoulder season.", evidenceIds: ["storage:lower48"] },
    { item: "Watch the Appalachian (Marcellus/Utica) rig count trend", reason: "A sustained WoW increase would signal a supply response that could offset the current LNG-driven demand tailwind.", evidenceIds: ["rigs:basin_marcellus", "rigs:basin_utica"] }
  ],
  bottomLine: "Directionally constructive for Range on firmer LNG demand and improving regional infrastructure, tempered by a persistent storage surplus that bears watching into shoulder season.",
  selectedEvidenceIds: [
    "deterministic_risk_opportunity:storage_levels",
    "deterministic_risk_opportunity:lng_demand",
    "storage:lower48",
    "steo_outlook:henryHubForecast",
    "news:article:1001",
    "news:article:1002",
    "rigs:basin_marcellus",
    "rigs:basin_utica"
  ]
};

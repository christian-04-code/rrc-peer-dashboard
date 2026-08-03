export type Quarter =
  | "Q1 2024"
  | "Q2 2024"
  | "Q3 2024"
  | "Q4 2024"
  | "Q1 2025"
  | "Q2 2025"
  | "Q3 2025"
  | "Q4 2025"
  | "Q1 2026";

export type DataClassification =
  | "Company-Reported Historical (Actual)"
  | "Consensus Estimate"
  | "Company Guidance";

export interface HistoricalMetric {
  unit: string;
  category: string;
  classification: DataClassification;
  reported_or_calculated: "reported" | "calculated";
  values: Partial<Record<Quarter, number | null>>;
  source_by_quarter: Partial<Record<Quarter, string>>;
  notes?: string;
  not_disclosed?: boolean;
  factset_overridden_quarters?: string[];
}

export interface CompanyHistorical {
  ticker: string;
  name: string;
  core_v1_peer: boolean;
  metrics: Record<string, HistoricalMetric>;
  normalized_metrics: Record<string, HistoricalMetric>;
  normalization_inputs: Record<string, HistoricalMetric>;
}

export interface HistoricalData {
  meta: {
    layer: string;
    coverage: string;
    quarters: Quarter[];
    conflict_rule: string;
    sources: string[];
    generated: string;
    core_v1_peers: string[];
    broader_peers: string[];
  };
  companies: Record<string, CompanyHistorical>;
}

export interface StorageRecord {
  date: string;
  "Lower 48 (Bcf)": number;
  [region: string]: string | number;
}

export interface ElectricDemandRecord {
  region: string;
  [date: string]: string | number | null;
}

export interface MarketData {
  meta: {
    label: string;
    note: string;
    generated: string;
    sources: string[];
  };
  henry_hub_daily_spot_price_usd_per_mmbtu: Record<string, number>;
  eia_weekly_working_gas_storage_bcf: StorageRecord[];
  eia_weekly_propane_stocks: Record<string, unknown>[];
  eia_monthly_natural_gas_pricing: Record<string, unknown>[];
  us_electric_demand_pct_change_vs_prior_week: ElectricDemandRecord[];
}

/** "company_guidance" = direct quote from data/guidance.json. "model_calculation" = summed
 *  by scripts/normalize-guidance.ts from multiple disclosed components. Distinct from
 *  DataClassification above, which describes historical.json's actual-vs-guidance-vs-consensus
 *  provenance — this describes whether a guidance figure itself was quoted or computed. */
export type GuidanceClassification = "company_guidance" | "model_calculation";

export interface GuidanceRangeValue {
  low: number;
  high: number;
  unit?: string;
  period: string;
  source_text: string;
  confidence: "high" | "medium" | "low";
  classification: GuidanceClassification;
  partial?: boolean;
  note?: string;
}

export interface GuidancePointValue {
  value: number;
  unit?: string;
  period: string;
  source_text: string;
  confidence: "high" | "medium" | "low";
  classification: GuidanceClassification;
  note?: string;
  direction?: string;
}

export interface GuidanceNormalizedPeer {
  production_total_bcfe_per_day: GuidanceRangeValue | null;
  production_yearend_target_bcfe_per_day?: GuidancePointValue;
  capex_total_mm: GuidanceRangeValue | null;
  cash_unit_cost_total: GuidanceRangeValue | null;
  financial_guidance: {
    fcf_mm: GuidanceRangeValue | null;
    ebitdax_mm: GuidanceRangeValue | null;
  };
  marketing_incremental_fcf_target_mm?: GuidancePointValue;
  fcf_growth_rate_pct?: GuidancePointValue;
}

export type GuidanceNormalizedData = Record<string, GuidanceNormalizedPeer>;

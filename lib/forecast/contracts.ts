import type { Ticker } from "@/lib/dashboard/types";

export type ForecastFieldProvenance =
  | "actual"
  | "management_guidance"
  | "derived_guidance"
  | "market"
  | "model"
  | "user_override";

export const FORECAST_PROVENANCE_CLASSES: readonly ForecastFieldProvenance[] = [
  "actual",
  "management_guidance",
  "derived_guidance",
  "market",
  "model",
  "user_override"
];

export type ForecastCompanyIdentity = {
  ticker: Ticker;
  name: string;
  shortName: string;
};

export type ForecastUnitConfig = {
  gasRate: "MMcf/d";
  liquidsRate: "Mbbl/d";
  combinedRate: "Bcfe/d";
  money: "$MM";
  gasPrice: "$/MMBtu";
  liquidsPrice: "$/bbl";
};

export type ForecastProductStream = {
  key: "gas" | "ngl" | "oil";
  label: string;
  rateField: "gasMmcfPerDay" | "nglMbblPerDay" | "oilMbblPerDay";
  unit: ForecastUnitConfig["gasRate"] | ForecastUnitConfig["liquidsRate"];
};

export type ForecastPeriods = {
  latestActualPeriod: string;
  latestDetailedActualPeriod: string;
  forecastYears: string[];
  defaultForwardYear: string;
};

export type ResolvedForecastField<T = number> = {
  value: T | null;
  unit: string;
  provenance: ForecastFieldProvenance;
  source: {
    name: string;
    reference?: string;
    period: string;
    notes?: string;
  };
};

export type ForecastCapability = {
  status: "available" | "unavailable";
  warning: string | null;
};

export type ForecastCompanyMetadata = ForecastCompanyIdentity & {
  supported: boolean;
  units: ForecastUnitConfig;
  periods: ForecastPeriods | null;
  productStreams: ForecastProductStream[];
  capabilities: {
    guidance: ForecastCapability;
    balanceSheet: ForecastCapability;
    hedges: ForecastCapability;
    valuation: ForecastCapability;
  };
  warnings: string[];
};

export type ForecastScenarioBody = {
  strategy?: unknown;
  preset?: unknown;
  production?: unknown;
  costs?: unknown;
  capex?: unknown;
  pricing?: unknown;
  commodityMode?: unknown;
  customCommodity?: unknown;
  liveCommodity?: unknown;
  valuation?: unknown;
};

export type ForecastGetResponse<TResult = unknown> = {
  company: ForecastCompanyMetadata;
  provenanceClasses: readonly ForecastFieldProvenance[];
  defaults: Record<string, unknown> | null;
  result: TResult | null;
  warnings: string[];
};

export type ForecastPostResponse<TResult = unknown> = {
  company: ForecastCompanyMetadata;
  result: TResult | null;
  fieldProvenance: Record<string, ForecastFieldProvenance>;
  warnings: string[];
};

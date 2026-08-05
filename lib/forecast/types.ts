export type ScenarioKind = "bear" | "base" | "bull" | "custom" | "live";
export type AssumptionClassification = "reported" | "guided" | "modeled" | "live";

export type AssumptionSource = {
  name: string;
  reference?: string;
  period: string;
  retrievedAt: string;
  classification: AssumptionClassification;
  notes?: string;
};

export type SourcedValue = {
  value: number | null;
  unit: string;
  source: AssumptionSource;
};

export type CommodityAssumptions = {
  henryHubPerMmbtu: SourcedValue;
  wtiPerBbl: SourcedValue;
  nglRealizationPctOfWti: SourcedValue;
};

export type RealizedPricingAssumptions = {
  gasBasisPerMcf: SourcedValue;
  gasTransportMarketingPerMcf: SourcedValue;
  gasHedgeImpactPerMcf: SourcedValue;
  nglMarketingUpliftPerBbl: SourcedValue;
  nglHedgeImpactPerBbl: SourcedValue;
  oilDifferentialPerBbl: SourcedValue;
  oilHedgeImpactPerBbl: SourcedValue;
};

export type ProductionAssumptions = {
  gasMmcfPerDay: SourcedValue;
  nglMbblPerDay: SourcedValue;
  oilMbblPerDay: SourcedValue;
};

export type CostAssumptions = {
  loePerMcfe: SourcedValue;
  gatheringTransportPerMcfe: SourcedValue;
  productionTaxPctRevenue: SourcedValue;
  cashGaMillion: SourcedValue;
  cashInterestMillion: SourcedValue;
  explorationMillion: SourcedValue;
  cashTaxRate: SourcedValue;
};

export type CapexAssumptions = {
  maintenanceDcMillion: SourcedValue;
  growthDcMillion: SourcedValue;
  landLeaseholdMillion: SourcedValue;
  facilitiesMillion: SourcedValue;
  environmentalMillion: SourcedValue;
  otherMillion: SourcedValue;
};

export type ForecastPeriodAssumptions = {
  period: string;
  days: number;
  commodity: CommodityAssumptions;
  pricing: RealizedPricingAssumptions;
  production: ProductionAssumptions;
  costs: CostAssumptions;
  capex: CapexAssumptions;
};

export type ForecastScenario = {
  id: string;
  name: string;
  description: string;
  kind: ScenarioKind;
  createdAt: string;
  updatedAt: string;
  author: string;
  engineVersion: string;
  periods: ForecastPeriodAssumptions[];
};

export type PricingResult = {
  realizedGasPerMcf: number | null;
  realizedNglPerBbl: number | null;
  realizedOilPerBbl: number | null;
};

export type ProductionResult = {
  gasMmcf: number | null;
  nglMbbl: number | null;
  oilMbbl: number | null;
  totalMcfe: number | null;
};

export type RevenueResult = {
  gasMillion: number | null;
  nglMillion: number | null;
  oilMillion: number | null;
  totalMillion: number | null;
};

export type CostResult = {
  loeMillion: number | null;
  gatheringTransportMillion: number | null;
  productionTaxMillion: number | null;
  cashGaMillion: number | null;
  explorationMillion: number | null;
  totalCashOperatingMillion: number | null;
};

export type CapexResult = {
  totalMillion: number | null;
};

export type ForecastPeriodResult = {
  period: string;
  pricing: PricingResult;
  production: ProductionResult;
  revenue: RevenueResult;
  costs: CostResult;
  capex: CapexResult;
  ebitdaMillion: number | null;
  ebitdaxMillion: number | null;
  cashTaxesMillion: number | null;
  operatingCashFlowBeforeWorkingCapitalMillion: number | null;
  freeCashFlowMillion: number | null;
  warnings: string[];
};

export type ForecastScenarioResult = {
  scenarioId: string;
  scenarioName: string;
  engineVersion: string;
  generatedAt: string;
  periods: ForecastPeriodResult[];
};

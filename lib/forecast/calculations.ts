import type {
  CapexResult,
  CostResult,
  ForecastPeriodAssumptions,
  PricingResult,
  ProductionResult,
  RevenueResult,
  SourcedValue
} from "@/lib/forecast/types";

function numeric(input: SourcedValue, label: string, warnings: string[]): number | null {
  if (input.value === null || !Number.isFinite(input.value)) {
    warnings.push(`${label} is unavailable.`);
    return null;
  }
  return input.value;
}

function sumNullable(values: Array<number | null>): number | null {
  return values.some((value) => value === null)
    ? null
    : (values as number[]).reduce((sum, value) => sum + value, 0);
}

export function calculatePricing(
  input: ForecastPeriodAssumptions,
  warnings: string[]
): PricingResult {
  const henryHub = numeric(input.commodity.henryHubPerMmbtu, "Henry Hub", warnings);
  const wti = numeric(input.commodity.wtiPerBbl, "WTI", warnings);
  const nglPct = numeric(input.commodity.nglRealizationPctOfWti, "NGL realization percentage", warnings);
  const gasBasis = numeric(input.pricing.gasBasisPerMcf, "Gas basis", warnings);
  const gasTransport = numeric(input.pricing.gasTransportMarketingPerMcf, "Gas transport/marketing", warnings);
  const gasHedge = numeric(input.pricing.gasHedgeImpactPerMcf, "Gas hedge impact", warnings);
  const nglUplift = numeric(input.pricing.nglMarketingUpliftPerBbl, "NGL marketing uplift", warnings);
  const nglHedge = numeric(input.pricing.nglHedgeImpactPerBbl, "NGL hedge impact", warnings);
  const oilDifferential = numeric(input.pricing.oilDifferentialPerBbl, "Oil differential", warnings);
  const oilHedge = numeric(input.pricing.oilHedgeImpactPerBbl, "Oil hedge impact", warnings);

  return {
    realizedGasPerMcf: sumNullable([henryHub, gasBasis, gasTransport, gasHedge]),
    realizedNglPerBbl:
      wti === null || nglPct === null || nglUplift === null || nglHedge === null
        ? null
        : wti * nglPct + nglUplift + nglHedge,
    realizedOilPerBbl: sumNullable([wti, oilDifferential, oilHedge])
  };
}

export function calculateProduction(
  input: ForecastPeriodAssumptions,
  warnings: string[]
): ProductionResult {
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 92) {
    warnings.push(`Invalid day count for ${input.period}.`);
    return { gasMmcf: null, nglMbbl: null, oilMbbl: null, totalMcfe: null };
  }

  const gasDaily = numeric(input.production.gasMmcfPerDay, "Gas production", warnings);
  const nglDaily = numeric(input.production.nglMbblPerDay, "NGL production", warnings);
  const oilDaily = numeric(input.production.oilMbblPerDay, "Oil production", warnings);
  const gasMmcf = gasDaily === null ? null : gasDaily * input.days;
  const nglMbbl = nglDaily === null ? null : nglDaily * input.days;
  const oilMbbl = oilDaily === null ? null : oilDaily * input.days;

  return {
    gasMmcf,
    nglMbbl,
    oilMbbl,
    totalMcfe:
      gasMmcf === null || nglMbbl === null || oilMbbl === null
        ? null
        : gasMmcf + (nglMbbl + oilMbbl) * 6
  };
}

export function calculateRevenue(
  production: ProductionResult,
  pricing: PricingResult
): RevenueResult {
  const gasMillion =
    production.gasMmcf === null || pricing.realizedGasPerMcf === null
      ? null
      : production.gasMmcf * pricing.realizedGasPerMcf / 1000;
  const nglMillion =
    production.nglMbbl === null || pricing.realizedNglPerBbl === null
      ? null
      : production.nglMbbl * pricing.realizedNglPerBbl / 1000;
  const oilMillion =
    production.oilMbbl === null || pricing.realizedOilPerBbl === null
      ? null
      : production.oilMbbl * pricing.realizedOilPerBbl / 1000;

  return {
    gasMillion,
    nglMillion,
    oilMillion,
    totalMillion: sumNullable([gasMillion, nglMillion, oilMillion])
  };
}

export function calculateCosts(
  input: ForecastPeriodAssumptions,
  production: ProductionResult,
  revenue: RevenueResult,
  warnings: string[]
): CostResult {
  const loePerMcfe = numeric(input.costs.loePerMcfe, "LOE per Mcfe", warnings);
  const gatheringPerMcfe = numeric(input.costs.gatheringTransportPerMcfe, "Gathering and transport per Mcfe", warnings);
  const productionTaxPct = numeric(input.costs.productionTaxPctRevenue, "Production tax rate", warnings);
  const cashGa = numeric(input.costs.cashGaMillion, "Cash G&A", warnings);
  const exploration = numeric(input.costs.explorationMillion, "Exploration expense", warnings);

  const loeMillion = production.totalMcfe === null || loePerMcfe === null
    ? null
    : production.totalMcfe * loePerMcfe / 1000;
  const gatheringTransportMillion = production.totalMcfe === null || gatheringPerMcfe === null
    ? null
    : production.totalMcfe * gatheringPerMcfe / 1000;
  const productionTaxMillion = revenue.totalMillion === null || productionTaxPct === null
    ? null
    : revenue.totalMillion * productionTaxPct;

  return {
    loeMillion,
    gatheringTransportMillion,
    productionTaxMillion,
    cashGaMillion: cashGa,
    explorationMillion: exploration,
    totalCashOperatingMillion: sumNullable([
      loeMillion,
      gatheringTransportMillion,
      productionTaxMillion,
      cashGa,
      exploration
    ])
  };
}

export function calculateCapex(
  input: ForecastPeriodAssumptions,
  warnings: string[]
): CapexResult {
  const values = [
    [input.capex.maintenanceDcMillion, "Maintenance D&C"],
    [input.capex.growthDcMillion, "Growth D&C"],
    [input.capex.landLeaseholdMillion, "Land and leasehold"],
    [input.capex.facilitiesMillion, "Facilities"],
    [input.capex.environmentalMillion, "Environmental capital"],
    [input.capex.otherMillion, "Other capital"]
  ] as const;

  // Individual category lines are still validated/warned on even when a total override is
  // present, so a genuinely unsupported category (e.g. no source-backed 2027 CapEx split)
  // still surfaces a warning -- it just no longer nulls out the total FCF depends on.
  const categorySum = sumNullable(values.map(([value, label]) => numeric(value, label, warnings)));
  const totalOverride = input.capex.totalOverrideMillion;
  const totalMillion =
    totalOverride && totalOverride.value !== null && Number.isFinite(totalOverride.value)
      ? totalOverride.value
      : categorySum;

  return { totalMillion };
}

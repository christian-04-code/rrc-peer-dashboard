import rawRegistry from "@/config/companies.json";
import {
  FORECAST_PROVENANCE_CLASSES,
  type ForecastCompanyMetadata,
  type ForecastFieldProvenance,
  type ForecastScenarioBody
} from "@/lib/forecast/contracts";
import { buildForecastYearWindow } from "@/lib/forecast/periods";
import { ForecastRequestError, type ForecastCompanyAdapter } from "@/lib/forecast/companies/types";
import {
  runRrcAnnualForecast,
  resolveAnnualProductionDefault,
  resolveAnnualCostDefaults,
  resolveAnnualCapexDefault,
  resolveAnnualPricingDefaults,
  resolveAnnualCommodityProductionDefaults,
  RRC_FORECAST_YEARS,
  type RrcAnnualForecastRequest,
  type RrcAnnualForecastResult,
  type RrcForecastYear
} from "@/lib/forecast/scenarios/rrc-annual";
import { latestReportedProduction, type RrcPost2027Strategy } from "@/lib/forecast/scenarios/rrc-complete";
import { buildCurrentMarketPrices, type LiveMarketMetric } from "@/lib/forecast/live-market-prices";
import { rrcManagementGuidance } from "@/lib/forecast/guidance/rrc";
import { rrcLatestDetailedBaseline } from "@/lib/forecast/data/rrc-baseline";
import { RRC_LATEST_ACTUAL_PERIOD, RRC_LATEST_DETAILED_ACTUAL_PERIOD } from "@/lib/forecast/data/rrc-actuals";

export const RRC_VALUATION_PRESETS = { bear: 4.5, base: 5.5, bull: 6.5 } as const;
type Preset = keyof typeof RRC_VALUATION_PRESETS;

const company = rawRegistry.companies.RRC;
const forecastYears = buildForecastYearWindow(RRC_LATEST_ACTUAL_PERIOD);
if (forecastYears.join(",") !== RRC_FORECAST_YEARS.join(",")) {
  throw new Error("RRC forecast periods are out of sync with the latest actual period.");
}

const available = { status: "available", warning: null } as const;
export const RRC_FORECAST_METADATA: ForecastCompanyMetadata = {
  ticker: "RRC",
  name: company.name,
  shortName: company.shortName,
  supported: true,
  units: {
    gasRate: "MMcf/d",
    liquidsRate: "Mbbl/d",
    combinedRate: "Bcfe/d",
    money: "$MM",
    gasPrice: "$/MMBtu",
    liquidsPrice: "$/bbl"
  },
  periods: {
    latestActualPeriod: RRC_LATEST_ACTUAL_PERIOD,
    latestDetailedActualPeriod: RRC_LATEST_DETAILED_ACTUAL_PERIOD,
    forecastYears,
    defaultForwardYear: forecastYears[1]
  },
  productStreams: [
    { key: "gas", label: "Natural gas", rateField: "gasMmcfPerDay", unit: "MMcf/d" },
    { key: "ngl", label: "NGL", rateField: "nglMbblPerDay", unit: "Mbbl/d" },
    { key: "oil", label: "Oil/condensate", rateField: "oilMbblPerDay", unit: "Mbbl/d" }
  ],
  capabilities: { guidance: available, balanceSheet: available, hedges: available, valuation: available },
  warnings: []
};

const LATEST_REPORTED_PRODUCTION_SUMMARY = {
  period: latestReportedProduction.period,
  sourceLabel: "Latest fully detailed production mix — Q1 2026 10-Q; latest reported total/financial actual is Q2 2026",
  gasMmcfPerDay: latestReportedProduction.gasMmcfPerDay.value,
  nglMbblPerDay: latestReportedProduction.nglMbblPerDay.value,
  oilMbblPerDay: latestReportedProduction.oilMbblPerDay.value
};

function invalid(message: string): never {
  throw new ForecastRequestError(message, 400);
}

function optionalNumber(value: unknown, path: string, minimum?: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(`${path} must be a finite number.`);
  if (minimum !== undefined && value < minimum) invalid(`${path} must be at least ${minimum}.`);
  return value;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) invalid(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function perYear<T extends Record<string, number | undefined>>(
  value: unknown,
  path: string,
  fields: ReadonlyArray<{ key: keyof T & string; minimum?: number }>
): Partial<Record<RrcForecastYear, T>> {
  const input = record(value, path);
  const output: Partial<Record<RrcForecastYear, T>> = {};
  for (const key of Object.keys(input)) {
    if (!RRC_FORECAST_YEARS.includes(key as RrcForecastYear)) invalid(`${path}.${key} is outside the active forecast window.`);
  }
  for (const year of RRC_FORECAST_YEARS) {
    if (input[year] === undefined) continue;
    const entry = record(input[year], `${path}.${year}`);
    const sanitized: Record<string, number> = {};
    for (const field of fields) {
      const parsed = optionalNumber(entry[field.key], `${path}.${year}.${field.key}`, field.minimum);
      if (parsed !== undefined) sanitized[field.key] = parsed;
    }
    if (Object.keys(sanitized).length) output[year] = sanitized as T;
  }
  return output;
}

function sanitizeRequest(bodyValue: ForecastScenarioBody): RrcAnnualForecastRequest {
  const body = record(bodyValue, "request");
  if (body.strategy !== undefined && body.strategy !== "maintenance" && body.strategy !== "continued-growth") {
    invalid("strategy must be maintenance or continued-growth.");
  }
  const strategy: RrcPost2027Strategy = body.strategy === "continued-growth" ? "continued-growth" : "maintenance";
  if (body.preset !== undefined && !["bear", "base", "bull"].includes(String(body.preset))) {
    invalid("preset must be bear, base, or bull.");
  }
  const preset: Preset = body.preset === "bear" || body.preset === "bull" ? body.preset : "base";
  if (body.commodityMode !== undefined && body.commodityMode !== "custom" && body.commodityMode !== "current-market") {
    invalid("commodityMode must be custom or current-market.");
  }
  const valuation = record(body.valuation, "valuation");
  const requestedForwardYear = valuation.forwardYear;
  if (requestedForwardYear !== undefined && !RRC_FORECAST_YEARS.includes(requestedForwardYear as RrcForecastYear)) {
    invalid("valuation.forwardYear is outside the active forecast window.");
  }
  const customCommodity = record(body.customCommodity, "customCommodity");
  const liveCommodity = record(body.liveCommodity, "liveCommodity") as { henryHub?: LiveMarketMetric; wti?: LiveMarketMetric };

  return {
    strategy,
    production: perYear(body.production, "production", [
      { key: "totalBcfePerDay", minimum: Number.EPSILON },
      { key: "gasMmcfPerDay", minimum: 0 },
      { key: "nglMbblPerDay", minimum: 0 },
      { key: "oilMbblPerDay", minimum: 0 }
    ]),
    costs: perYear(body.costs, "costs", [
      { key: "loePerMcfe" },
      { key: "gatheringTransportPerMcfe" },
      { key: "cashGaPerMcfe" },
      { key: "explorationMillion" },
      { key: "cashInterestMillion" },
      { key: "cashTaxRate" }
    ]),
    capex: perYear(body.capex, "capex", [{ key: "totalMillion", minimum: 0 }]),
    pricing: perYear(body.pricing, "pricing", [{ key: "gasBasisPerMcf" }, { key: "oilDifferentialPerBbl" }]),
    commodityMode: body.commodityMode === "custom" ? "custom" : "current-market",
    customCommodity: {
      henryHubPerMmbtu: optionalNumber(customCommodity.henryHubPerMmbtu, "customCommodity.henryHubPerMmbtu"),
      wtiPerBbl: optionalNumber(customCommodity.wtiPerBbl, "customCommodity.wtiPerBbl"),
      nglPerBbl: optionalNumber(customCommodity.nglPerBbl, "customCommodity.nglPerBbl")
    },
    liveCommodity: buildCurrentMarketPrices(liveCommodity),
    valuation: {
      targetEvToEbitdax:
        optionalNumber(valuation.targetEvToEbitdax, "valuation.targetEvToEbitdax", 0) ?? RRC_VALUATION_PRESETS[preset],
      forwardYear: (requestedForwardYear as RrcForecastYear | undefined) ?? (RRC_FORECAST_METADATA.periods!.defaultForwardYear as RrcForecastYear),
      netDebtMillionOverride: optionalNumber(valuation.netDebtMillionOverride, "valuation.netDebtMillionOverride"),
      dilutedSharesMillionOverride: optionalNumber(valuation.dilutedSharesMillionOverride, "valuation.dilutedSharesMillionOverride", Number.EPSILON)
    }
  };
}

function provenanceFor(value: unknown): ForecastFieldProvenance {
  if (!value || typeof value !== "object") return "model";
  const item = value as { classification?: string; notes?: string };
  if (item.classification === "reported") return "actual";
  if (item.classification === "live") return "market";
  if (item.classification === "user") return "user_override";
  if (item.classification === "guided") {
    return /reconcil|derived|modeled from guidance/i.test(item.notes ?? "") ? "derived_guidance" : "management_guidance";
  }
  return "model";
}

function buildFieldProvenance(request: RrcAnnualForecastRequest, body: ForecastScenarioBody): Record<string, ForecastFieldProvenance> {
  const fields: Record<string, ForecastFieldProvenance> = {};
  const productionFields = ["totalBcfePerDay", "gasMmcfPerDay", "nglMbblPerDay", "oilMbblPerDay"] as const;
  const costFields = ["loePerMcfe", "gatheringTransportPerMcfe", "cashGaPerMcfe", "explorationMillion", "cashInterestMillion", "cashTaxRate"] as const;
  const pricingFields = ["gasBasisPerMcf", "oilDifferentialPerBbl"] as const;

  for (const year of RRC_FORECAST_YEARS) {
    const productionDefaults = {
      totalBcfePerDay: resolveAnnualProductionDefault(year),
      ...resolveAnnualCommodityProductionDefaults(year)
    };
    for (const field of productionFields) {
      fields[`production.${year}.${field}`] = request.production[year]?.[field] !== undefined
        ? "user_override"
        : provenanceFor(productionDefaults[field]);
    }
    const costDefaults = resolveAnnualCostDefaults(year);
    for (const field of costFields) {
      fields[`costs.${year}.${field}`] = request.costs[year]?.[field] !== undefined
        ? "user_override"
        : provenanceFor(costDefaults[field as keyof typeof costDefaults]);
    }
    fields[`capex.${year}.totalMillion`] = request.capex[year]?.totalMillion !== undefined
      ? "user_override"
      : provenanceFor(resolveAnnualCapexDefault(year, request.strategy));
    const pricingDefaults = resolveAnnualPricingDefaults(year);
    for (const field of pricingFields) {
      fields[`pricing.${year}.${field}`] = request.pricing[year]?.[field] !== undefined
        ? "user_override"
        : provenanceFor(pricingDefaults[field]);
    }
  }

  const commodityFields = ["henryHubPerMmbtu", "wtiPerBbl", "nglPerBbl"] as const;
  for (const field of commodityFields) {
    fields[`commodity.${field}`] = request.customCommodity?.[field] !== undefined
      ? "user_override"
      : request.liveCommodity?.[field]?.source.classification === "live"
        ? "market"
        : "model";
  }
  const suppliedValuation = body.valuation && typeof body.valuation === "object" && !Array.isArray(body.valuation)
    ? body.valuation as Record<string, unknown>
    : {};
  fields["valuation.targetEvToEbitdax"] = suppliedValuation.targetEvToEbitdax !== undefined || body.preset !== undefined ? "user_override" : "model";
  fields["valuation.forwardYear"] = suppliedValuation.forwardYear !== undefined ? "user_override" : "model";
  fields["reportedPeriods.through"] = "actual";
  return fields;
}

function sourcedDefaults<T extends Record<string, unknown>>(values: T): T {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (value && typeof value === "object" && "classification" in value) {
        return [key, { ...value, provenance: provenanceFor(value) }];
      }
      if (value && typeof value === "object" && !Array.isArray(value)) return [key, sourcedDefaults(value as Record<string, unknown>)];
      return [key, value];
    })
  ) as T;
}

function defaultRequest(): RrcAnnualForecastRequest {
  return {
    strategy: "maintenance",
    production: {},
    costs: {},
    capex: {},
    pricing: {},
    commodityMode: "current-market",
    valuation: { targetEvToEbitdax: RRC_VALUATION_PRESETS.base, forwardYear: "2027" }
  };
}

export function getRrcLegacyDefaults(): Record<string, unknown> {
  const strategy: RrcPost2027Strategy = "maintenance";
  return {
    latestReportedProduction: LATEST_REPORTED_PRODUCTION_SUMMARY,
    latestActualPeriod: RRC_LATEST_ACTUAL_PERIOD,
    valuationPresets: RRC_VALUATION_PRESETS,
    guidance: rrcManagementGuidance,
    productionDefaults: Object.fromEntries(RRC_FORECAST_YEARS.map((year) => [year, resolveAnnualProductionDefault(year)])),
    commodityProductionDefaults: Object.fromEntries(RRC_FORECAST_YEARS.map((year) => [year, resolveAnnualCommodityProductionDefaults(year)])),
    costDefaults: Object.fromEntries(RRC_FORECAST_YEARS.map((year) => [year, resolveAnnualCostDefaults(year)])),
    capexDefaults: Object.fromEntries(RRC_FORECAST_YEARS.map((year) => [year, resolveAnnualCapexDefault(year, strategy)])),
    pricingDefaults: Object.fromEntries(RRC_FORECAST_YEARS.map((year) => [year, resolveAnnualPricingDefaults(year)])),
    currentNetDebtMillion: rrcLatestDetailedBaseline.balanceSheetNetDebtMillion.value,
    dilutedSharesMillion: rrcLatestDetailedBaseline.dilutedSharesMillion.value,
    result: runRrcAnnualForecast(defaultRequest())
  };
}

export function runRrcLegacyForecast(body: ForecastScenarioBody): Record<string, unknown> {
  return { latestReportedProduction: LATEST_REPORTED_PRODUCTION_SUMMARY, result: runRrcAnnualForecast(sanitizeRequest(body)) };
}

export const rrcForecastAdapter: ForecastCompanyAdapter<RrcAnnualForecastResult> = {
  metadata: RRC_FORECAST_METADATA,
  configuration: {
    latestDetailedActualPeriod: RRC_LATEST_DETAILED_ACTUAL_PERIOD,
    guidance: rrcManagementGuidance,
    defaults: { production: available, pricing: available, costs: available, capex: available },
    balanceSheet: {
      netDebtMillion: rrcLatestDetailedBaseline.balanceSheetNetDebtMillion.value,
      dilutedSharesMillion: rrcLatestDetailedBaseline.dilutedSharesMillion.value,
      status: available
    },
    hedges: available,
    valuationPresets: RRC_VALUATION_PRESETS,
    sourceMetadata: { warnings: [] }
  },
  getForecast() {
    const legacy = getRrcLegacyDefaults();
    const { result, ...defaults } = legacy;
    return {
      company: RRC_FORECAST_METADATA,
      provenanceClasses: FORECAST_PROVENANCE_CLASSES,
      defaults: sourcedDefaults(defaults),
      result: result as RrcAnnualForecastResult,
      warnings: []
    };
  },
  runForecast(body) {
    const request = sanitizeRequest(body);
    return {
      company: RRC_FORECAST_METADATA,
      result: runRrcAnnualForecast(request),
      fieldProvenance: buildFieldProvenance(request, body),
      warnings: []
    };
  },
  getLegacyDefaults: getRrcLegacyDefaults,
  runLegacyForecast: runRrcLegacyForecast
};

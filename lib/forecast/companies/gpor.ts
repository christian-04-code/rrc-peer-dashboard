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
  GPOR_FORECAST_YEARS,
  GPOR_LATEST_ACTUAL_PERIOD,
  GPOR_VALUATION_PRESETS,
  resolveAnnualProductionDefault,
  resolveAnnualCommodityProductionDefaults,
  resolveAnnualCostDefaults,
  resolveAnnualCapexDefault,
  resolveAnnualPricingDefaults,
  runGporAnnualForecast,
  type GporForecastYear,
  type GporAnnualForecastRequest,
  type GporAnnualForecastResult
} from "@/lib/forecast/scenarios/gpor-annual";
import { gporManagementGuidance, gporGuidedDiscretionaryAcreageCapexMillion } from "@/lib/forecast/guidance/gpor";
import { gporLatestDetailedBaseline } from "@/lib/forecast/data/gpor-baseline";
import type { ResolvedAnnualValue } from "@/lib/forecast/scenarios/annual-shared";

const company = rawRegistry.companies.GPOR;
const forecastYears = buildForecastYearWindow(GPOR_LATEST_ACTUAL_PERIOD);
if (forecastYears.join(",") !== GPOR_FORECAST_YEARS.join(",")) {
  throw new Error("GPOR forecast periods are out of sync with the latest actual period.");
}

const available = { status: "available", warning: null } as const;
const hedgesUnavailable = {
  status: "unavailable",
  warning: "GPOR hedge positions have not yet been ingested into this engine's structured hedge format; the Forecast model treats GPOR as unhedged (pre-cash-settled-derivative realized pricing) pending a dedicated hedge-data backfill."
} as const;

const discretionaryCapexMillion = gporGuidedDiscretionaryAcreageCapexMillion();
const discretionaryCapexWarning =
  discretionaryCapexMillion !== null
    ? `GPOR's default capex excludes a separately-guided $${discretionaryCapexMillion}mm FY2026 discretionary acreage acquisition program, which management describes as "additional" to the base operated program -- not included by default; model it via a capex override if desired.`
    : null;

export const GPOR_FORECAST_METADATA: ForecastCompanyMetadata = {
  ticker: "GPOR",
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
    latestActualPeriod: GPOR_LATEST_ACTUAL_PERIOD,
    latestDetailedActualPeriod: GPOR_LATEST_ACTUAL_PERIOD,
    forecastYears,
    defaultForwardYear: forecastYears[1]
  },
  productStreams: [
    { key: "gas", label: "Natural gas", rateField: "gasMmcfPerDay", unit: "MMcf/d" },
    { key: "ngl", label: "NGL", rateField: "nglMbblPerDay", unit: "Mbbl/d" },
    { key: "oil", label: "Oil/condensate", rateField: "oilMbblPerDay", unit: "Mbbl/d" }
  ],
  capabilities: { guidance: available, balanceSheet: available, hedges: hedgesUnavailable, valuation: available },
  warnings: discretionaryCapexWarning ? [hedgesUnavailable.warning, discretionaryCapexWarning] : [hedgesUnavailable.warning]
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
): Partial<Record<GporForecastYear, T>> {
  const input = record(value, path);
  const output: Partial<Record<GporForecastYear, T>> = {};
  for (const key of Object.keys(input)) {
    if (!GPOR_FORECAST_YEARS.includes(key as GporForecastYear)) invalid(`${path}.${key} is outside the active forecast window.`);
  }
  for (const year of GPOR_FORECAST_YEARS) {
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

function sanitizeRequest(bodyValue: ForecastScenarioBody): GporAnnualForecastRequest {
  const body = record(bodyValue, "request");
  if (body.commodityMode !== undefined && body.commodityMode !== "custom" && body.commodityMode !== "current-market") {
    invalid("commodityMode must be custom or current-market.");
  }
  const valuation = record(body.valuation, "valuation");
  const requestedForwardYear = valuation.forwardYear;
  if (requestedForwardYear !== undefined && !GPOR_FORECAST_YEARS.includes(requestedForwardYear as GporForecastYear)) {
    invalid("valuation.forwardYear is outside the active forecast window.");
  }
  const customCommodity = record(body.customCommodity, "customCommodity");
  const liveCommodity = record(body.liveCommodity, "liveCommodity") as GporAnnualForecastRequest["liveCommodity"];

  return {
    production: perYear(body.production, "production", [
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
    liveCommodity,
    valuation: {
      targetEvToEbitdax: optionalNumber(valuation.targetEvToEbitdax, "valuation.targetEvToEbitdax", 0) ?? GPOR_VALUATION_PRESETS.base,
      forwardYear: (requestedForwardYear as GporForecastYear | undefined) ?? (GPOR_FORECAST_METADATA.periods!.defaultForwardYear as GporForecastYear),
      netDebtMillionOverride: optionalNumber(valuation.netDebtMillionOverride, "valuation.netDebtMillionOverride"),
      dilutedSharesMillionOverride: optionalNumber(valuation.dilutedSharesMillionOverride, "valuation.dilutedSharesMillionOverride", Number.EPSILON)
    }
  };
}

function provenanceFor(resolved: { classification: string; notes?: string }): ForecastFieldProvenance {
  if (resolved.classification === "reported") return "actual";
  if (resolved.classification === "live") return "market";
  if (resolved.classification === "user") return "user_override";
  if (resolved.classification === "guided") {
    return /reconcil|derived|modeled from guidance/i.test(resolved.notes ?? "") ? "derived_guidance" : "management_guidance";
  }
  return "model";
}

function buildFieldProvenance(request: GporAnnualForecastRequest): Record<string, ForecastFieldProvenance> {
  const fields: Record<string, ForecastFieldProvenance> = {};
  const productionFields = ["gasMmcfPerDay", "nglMbblPerDay", "oilMbblPerDay"] as const;
  const costFields = ["loePerMcfe", "gatheringTransportPerMcfe", "cashGaPerMcfe", "explorationMillion", "cashInterestMillion", "cashTaxRate"] as const;
  const pricingFields = ["gasBasisPerMcf", "oilDifferentialPerBbl"] as const;

  for (const year of GPOR_FORECAST_YEARS) {
    const commodityDefaults = resolveAnnualCommodityProductionDefaults(year);
    for (const field of productionFields) {
      fields[`production.${year}.${field}`] = request.production[year]?.[field] !== undefined ? "user_override" : provenanceFor(commodityDefaults[field]);
    }
    const costDefaults = resolveAnnualCostDefaults(year);
    for (const field of costFields) {
      fields[`costs.${year}.${field}`] = request.costs[year]?.[field] !== undefined ? "user_override" : provenanceFor(costDefaults[field]);
    }
    fields[`capex.${year}.totalMillion`] = request.capex[year]?.totalMillion !== undefined ? "user_override" : provenanceFor(resolveAnnualCapexDefault(year));
    const pricingDefaults = resolveAnnualPricingDefaults(year);
    for (const field of pricingFields) {
      fields[`pricing.${year}.${field}`] = request.pricing[year]?.[field] !== undefined ? "user_override" : provenanceFor(pricingDefaults[field]);
    }
  }

  fields["commodity.henryHubPerMmbtu"] = request.customCommodity?.henryHubPerMmbtu !== undefined ? "user_override" : request.liveCommodity?.henryHubPerMmbtu?.source.classification === "live" ? "market" : "model";
  fields["commodity.wtiPerBbl"] = request.customCommodity?.wtiPerBbl !== undefined ? "user_override" : request.liveCommodity?.wtiPerBbl?.source.classification === "live" ? "market" : "model";
  fields["valuation.targetEvToEbitdax"] = request.valuation.targetEvToEbitdax !== GPOR_VALUATION_PRESETS.base ? "user_override" : "model";
  fields["valuation.forwardYear"] = "model";
  fields["reportedPeriods.through"] = "actual";
  return fields;
}

function sourcedDefaults<T extends Record<string, unknown>>(values: T): T {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (value && typeof value === "object" && "classification" in value) {
        return [key, { ...value, provenance: provenanceFor(value as ResolvedAnnualValue) }];
      }
      if (value && typeof value === "object" && !Array.isArray(value)) return [key, sourcedDefaults(value as Record<string, unknown>)];
      return [key, value];
    })
  ) as T;
}

function defaultRequest(): GporAnnualForecastRequest {
  return {
    production: {},
    costs: {},
    capex: {},
    pricing: {},
    commodityMode: "current-market",
    valuation: { targetEvToEbitdax: GPOR_VALUATION_PRESETS.base, forwardYear: "2027" }
  };
}

function legacyDefaults(): Record<string, unknown> {
  return {
    latestActualPeriod: GPOR_LATEST_ACTUAL_PERIOD,
    valuationPresets: GPOR_VALUATION_PRESETS,
    guidance: gporManagementGuidance,
    productionDefaults: Object.fromEntries(GPOR_FORECAST_YEARS.map((year) => [year, resolveAnnualProductionDefault(year)])),
    commodityProductionDefaults: Object.fromEntries(GPOR_FORECAST_YEARS.map((year) => [year, resolveAnnualCommodityProductionDefaults(year)])),
    costDefaults: Object.fromEntries(GPOR_FORECAST_YEARS.map((year) => [year, resolveAnnualCostDefaults(year)])),
    capexDefaults: Object.fromEntries(GPOR_FORECAST_YEARS.map((year) => [year, resolveAnnualCapexDefault(year)])),
    pricingDefaults: Object.fromEntries(GPOR_FORECAST_YEARS.map((year) => [year, resolveAnnualPricingDefaults(year)])),
    currentNetDebtMillion: gporLatestDetailedBaseline.netDebtMillion.value,
    dilutedSharesMillion: gporLatestDetailedBaseline.dilutedSharesMillion.value,
    result: runGporAnnualForecast(defaultRequest())
  };
}

export const gporForecastAdapter: ForecastCompanyAdapter<GporAnnualForecastResult> = {
  metadata: GPOR_FORECAST_METADATA,
  configuration: {
    latestDetailedActualPeriod: GPOR_LATEST_ACTUAL_PERIOD,
    guidance: gporManagementGuidance,
    defaults: { production: available, pricing: available, costs: available, capex: available },
    balanceSheet: {
      netDebtMillion: gporLatestDetailedBaseline.netDebtMillion.value,
      dilutedSharesMillion: gporLatestDetailedBaseline.dilutedSharesMillion.value,
      status: available
    },
    hedges: hedgesUnavailable,
    valuationPresets: GPOR_VALUATION_PRESETS,
    sourceMetadata: { warnings: discretionaryCapexWarning ? [hedgesUnavailable.warning, discretionaryCapexWarning] : [hedgesUnavailable.warning] }
  },
  getForecast() {
    const legacy = legacyDefaults();
    const { result, ...defaults } = legacy;
    return {
      company: GPOR_FORECAST_METADATA,
      provenanceClasses: FORECAST_PROVENANCE_CLASSES,
      defaults: sourcedDefaults(defaults),
      result: result as GporAnnualForecastResult,
      warnings: GPOR_FORECAST_METADATA.warnings
    };
  },
  runForecast(body) {
    const request = sanitizeRequest(body);
    return {
      company: GPOR_FORECAST_METADATA,
      result: runGporAnnualForecast(request),
      fieldProvenance: buildFieldProvenance(request),
      warnings: GPOR_FORECAST_METADATA.warnings
    };
  }
};

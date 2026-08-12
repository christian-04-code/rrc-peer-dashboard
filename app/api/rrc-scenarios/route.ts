import { NextResponse } from "next/server";
import {
  runRrcAnnualForecast,
  resolveAnnualProductionDefault,
  resolveAnnualCostDefaults,
  resolveAnnualCapexDefault,
  resolveAnnualPricingDefaults,
  resolveAnnualCommodityProductionDefaults,
  RRC_FORECAST_YEARS,
  type RrcAnnualForecastRequest,
  type RrcAnnualProductionInput,
  type RrcAnnualCostsInput,
  type RrcAnnualCapexInput,
  type RrcAnnualPricingInput,
  type RrcCommodityMode,
  type RrcForecastYear
} from "@/lib/forecast/scenarios/rrc-annual";
import { latestReportedProduction, type RrcPost2027Strategy } from "@/lib/forecast/scenarios/rrc-complete";
import { buildCurrentMarketPrices, type LiveMarketMetric } from "@/lib/forecast/live-market-prices";
import { rrcManagementGuidance } from "@/lib/forecast/guidance/rrc";
import { rrcQ1_2026Baseline } from "@/lib/forecast/data/rrc-baseline";
import { RRC_LATEST_ACTUAL_PERIOD } from "@/lib/forecast/data/rrc-actuals";

export const dynamic = "force-dynamic";

/** Bear/base/bull remain transparent, valuation-only presets: they change only the target EV/EBITDAX multiple, never commodity prices, production, CapEx, or costs. */
const RRC_VALUATION_PRESETS = { bear: 4.5, base: 5.5, bull: 6.5 } as const;
type Preset = keyof typeof RRC_VALUATION_PRESETS;

const LATEST_REPORTED_PRODUCTION_SUMMARY = {
  period: latestReportedProduction.period,
  sourceLabel: "Latest fully detailed production mix — Q1 2026 10-Q; latest reported total/financial actual is Q2 2026",
  gasMmcfPerDay: latestReportedProduction.gasMmcfPerDay.value,
  nglMbblPerDay: latestReportedProduction.nglMbblPerDay.value,
  oilMbblPerDay: latestReportedProduction.oilMbblPerDay.value
};

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isYear(value: unknown): value is RrcForecastYear {
  return value === "2026" || value === "2027" || value === "2028";
}

function sanitizeStrategy(value: unknown): RrcPost2027Strategy {
  return value === "continued-growth" ? "continued-growth" : "maintenance";
}

function sanitizeProduction(input: unknown): RrcAnnualForecastRequest["production"] {
  const out: RrcAnnualForecastRequest["production"] = {};
  if (typeof input !== "object" || input === null) return out;
  for (const year of RRC_FORECAST_YEARS) {
    const entry = (input as Record<string, unknown>)[year];
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const sanitized: RrcAnnualProductionInput = {};
    if (validNumber(record.totalBcfePerDay) && record.totalBcfePerDay > 0) sanitized.totalBcfePerDay = record.totalBcfePerDay;
    if (validNumber(record.gasMmcfPerDay) && record.gasMmcfPerDay >= 0) sanitized.gasMmcfPerDay = record.gasMmcfPerDay;
    if (validNumber(record.nglMbblPerDay) && record.nglMbblPerDay >= 0) sanitized.nglMbblPerDay = record.nglMbblPerDay;
    if (validNumber(record.oilMbblPerDay) && record.oilMbblPerDay >= 0) sanitized.oilMbblPerDay = record.oilMbblPerDay;
    if (Object.keys(sanitized).length > 0) out[year] = sanitized;
  }
  return out;
}

const COST_FIELDS: Array<keyof RrcAnnualCostsInput> = [
  "loePerMcfe",
  "gatheringTransportPerMcfe",
  "cashGaPerMcfe",
  "explorationMillion",
  "cashInterestMillion",
  "cashTaxRate"
];

function sanitizeCosts(input: unknown): RrcAnnualForecastRequest["costs"] {
  const out: RrcAnnualForecastRequest["costs"] = {};
  if (typeof input !== "object" || input === null) return out;
  for (const year of RRC_FORECAST_YEARS) {
    const entry = (input as Record<string, unknown>)[year];
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const sanitized: RrcAnnualCostsInput = {};
    for (const field of COST_FIELDS) {
      if (validNumber(record[field])) sanitized[field] = record[field] as number;
    }
    if (Object.keys(sanitized).length > 0) out[year] = sanitized;
  }
  return out;
}

function sanitizeCapex(input: unknown): RrcAnnualForecastRequest["capex"] {
  const out: RrcAnnualForecastRequest["capex"] = {};
  if (typeof input !== "object" || input === null) return out;
  for (const year of RRC_FORECAST_YEARS) {
    const entry = (input as Record<string, unknown>)[year];
    if (typeof entry !== "object" || entry === null) continue;
    const totalMillion = (entry as Record<string, unknown>).totalMillion;
    const sanitized: RrcAnnualCapexInput = {};
    if (validNumber(totalMillion) && totalMillion >= 0) sanitized.totalMillion = totalMillion;
    if (Object.keys(sanitized).length > 0) out[year] = sanitized;
  }
  return out;
}

const PRICING_FIELDS: Array<keyof RrcAnnualPricingInput> = ["gasBasisPerMcf", "oilDifferentialPerBbl"];

function sanitizePricing(input: unknown): RrcAnnualForecastRequest["pricing"] {
  const out: RrcAnnualForecastRequest["pricing"] = {};
  if (typeof input !== "object" || input === null) return out;
  for (const year of RRC_FORECAST_YEARS) {
    const entry = (input as Record<string, unknown>)[year];
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const sanitized: RrcAnnualPricingInput = {};
    for (const field of PRICING_FIELDS) {
      if (validNumber(record[field])) sanitized[field] = record[field] as number;
    }
    if (Object.keys(sanitized).length > 0) out[year] = sanitized;
  }
  return out;
}

function sanitizeCommodityMode(value: unknown): RrcCommodityMode {
  return value === "custom" ? "custom" : "current-market";
}

function sanitizeCustomCommodity(input: unknown): RrcAnnualForecastRequest["customCommodity"] {
  if (typeof input !== "object" || input === null) return undefined;
  const record = input as Record<string, unknown>;
  const out: RrcAnnualForecastRequest["customCommodity"] = {};
  if (validNumber(record.henryHubPerMmbtu)) out.henryHubPerMmbtu = record.henryHubPerMmbtu;
  if (validNumber(record.wtiPerBbl)) out.wtiPerBbl = record.wtiPerBbl;
  if (validNumber(record.nglPerBbl)) out.nglPerBbl = record.nglPerBbl;
  return out;
}

type ScenarioRequestBody = {
  strategy?: unknown;
  preset?: unknown;
  production?: unknown;
  costs?: unknown;
  capex?: unknown;
  pricing?: unknown;
  commodityMode?: unknown;
  customCommodity?: unknown;
  liveCommodity?: { henryHub?: LiveMarketMetric; wti?: LiveMarketMetric };
  valuation?: {
    targetEvToEbitdax?: unknown;
    forwardYear?: unknown;
    netDebtMillionOverride?: unknown;
    dilutedSharesMillionOverride?: unknown;
  };
};

function sanitizeRequest(body: ScenarioRequestBody): RrcAnnualForecastRequest {
  const strategy = sanitizeStrategy(body.strategy);
  const preset: Preset = body.preset === "bear" || body.preset === "bull" ? body.preset : "base";
  const targetEvToEbitdax = validNumber(body.valuation?.targetEvToEbitdax)
    ? (body.valuation!.targetEvToEbitdax as number)
    : RRC_VALUATION_PRESETS[preset];
  const forwardYear = isYear(body.valuation?.forwardYear) ? (body.valuation!.forwardYear as RrcForecastYear) : "2027";
  // commodityMode is accepted for backward compatibility but no longer gates behavior:
  // customCommodity and liveCommodity are always both passed through, and rrc-annual.ts
  // resolves each of the three prices independently (custom value wins per field, else the
  // live/current-market value) so overriding e.g. only natural gas leaves NGL/oil on
  // Default Forecast market pricing instead of requiring an all-or-nothing switch.
  const commodityMode = sanitizeCommodityMode(body.commodityMode);

  return {
    strategy,
    production: sanitizeProduction(body.production),
    costs: sanitizeCosts(body.costs),
    capex: sanitizeCapex(body.capex),
    pricing: sanitizePricing(body.pricing),
    commodityMode,
    customCommodity: sanitizeCustomCommodity(body.customCommodity),
    liveCommodity: buildCurrentMarketPrices(body.liveCommodity ?? {}),
    valuation: {
      targetEvToEbitdax,
      forwardYear,
      netDebtMillionOverride: validNumber(body.valuation?.netDebtMillionOverride) ? (body.valuation!.netDebtMillionOverride as number) : undefined,
      dilutedSharesMillionOverride: validNumber(body.valuation?.dilutedSharesMillionOverride) ? (body.valuation!.dilutedSharesMillionOverride as number) : undefined
    }
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScenarioRequestBody;
    const scenarioRequest = sanitizeRequest(body);

    return NextResponse.json({
      latestReportedProduction: LATEST_REPORTED_PRODUCTION_SUMMARY,
      result: runRrcAnnualForecast(scenarioRequest)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to calculate RRC scenario." },
      { status: 400 }
    );
  }
}

export async function GET() {
  const strategy: RrcPost2027Strategy = "maintenance";
  const defaultRequest: RrcAnnualForecastRequest = {
    strategy,
    production: {},
    costs: {},
    capex: {},
    pricing: {},
    commodityMode: "current-market",
    valuation: { targetEvToEbitdax: RRC_VALUATION_PRESETS.base, forwardYear: "2027" }
  };

  return NextResponse.json({
    latestReportedProduction: LATEST_REPORTED_PRODUCTION_SUMMARY,
    latestActualPeriod: RRC_LATEST_ACTUAL_PERIOD,
    valuationPresets: RRC_VALUATION_PRESETS,
    guidance: rrcManagementGuidance,
    productionDefaults: Object.fromEntries(RRC_FORECAST_YEARS.map((year) => [year, resolveAnnualProductionDefault(year)])),
    commodityProductionDefaults: Object.fromEntries(RRC_FORECAST_YEARS.map((year) => [year, resolveAnnualCommodityProductionDefaults(year)])),
    costDefaults: Object.fromEntries(RRC_FORECAST_YEARS.map((year) => [year, resolveAnnualCostDefaults(year)])),
    capexDefaults: Object.fromEntries(RRC_FORECAST_YEARS.map((year) => [year, resolveAnnualCapexDefault(year, strategy)])),
    pricingDefaults: Object.fromEntries(RRC_FORECAST_YEARS.map((year) => [year, resolveAnnualPricingDefaults(year)])),
    currentNetDebtMillion: rrcQ1_2026Baseline.balanceSheetNetDebtMillion.value,
    dilutedSharesMillion: rrcQ1_2026Baseline.dilutedSharesMillion.value,
    result: runRrcAnnualForecast(defaultRequest)
  });
}

import { NextResponse } from "next/server";
import {
  runRrcAnnualForecast,
  resolveAnnualProductionDefault,
  resolveAnnualCostDefaults,
  resolveAnnualCapexDefault,
  RRC_FORECAST_YEARS,
  type RrcAnnualForecastRequest,
  type RrcAnnualCostsInput,
  type RrcAnnualCapexInput,
  type RrcCommodityMode,
  type RrcForecastYear
} from "@/lib/forecast/scenarios/rrc-annual";
import { latestReportedProduction, type RrcPost2027Strategy } from "@/lib/forecast/scenarios/rrc-complete";
import { buildCurrentMarketPrices, type LiveMarketMetric } from "@/lib/forecast/live-market-prices";
import { rrcManagementGuidance } from "@/lib/forecast/guidance/rrc";
import { rrcQ1_2026Baseline } from "@/lib/forecast/data/rrc-baseline";

export const dynamic = "force-dynamic";

/** Bear/base/bull remain transparent, valuation-only presets: they change only the target EV/EBITDAX multiple, never commodity prices, production, CapEx, or costs. */
const RRC_VALUATION_PRESETS = { bear: 4.5, base: 5.5, bull: 6.5 } as const;
type Preset = keyof typeof RRC_VALUATION_PRESETS;

const LATEST_REPORTED_PRODUCTION_SUMMARY = {
  period: latestReportedProduction.period,
  sourceLabel: "Latest reported production — Q1 2026 10-Q",
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
    const totalBcfePerDay = (entry as Record<string, unknown>).totalBcfePerDay;
    if (validNumber(totalBcfePerDay) && totalBcfePerDay > 0) out[year] = { totalBcfePerDay };
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
  const commodityMode = sanitizeCommodityMode(body.commodityMode);

  return {
    strategy,
    production: sanitizeProduction(body.production),
    costs: sanitizeCosts(body.costs),
    capex: sanitizeCapex(body.capex),
    commodityMode,
    customCommodity: commodityMode === "custom" ? sanitizeCustomCommodity(body.customCommodity) : undefined,
    liveCommodity: commodityMode === "current-market" ? buildCurrentMarketPrices(body.liveCommodity ?? {}) : undefined,
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
    commodityMode: "current-market",
    valuation: { targetEvToEbitdax: RRC_VALUATION_PRESETS.base, forwardYear: "2027" }
  };

  return NextResponse.json({
    latestReportedProduction: LATEST_REPORTED_PRODUCTION_SUMMARY,
    valuationPresets: RRC_VALUATION_PRESETS,
    guidance: rrcManagementGuidance,
    productionDefaults: Object.fromEntries(RRC_FORECAST_YEARS.map((year) => [year, resolveAnnualProductionDefault(year)])),
    costDefaults: Object.fromEntries(RRC_FORECAST_YEARS.map((year) => [year, resolveAnnualCostDefaults(year)])),
    capexDefaults: Object.fromEntries(RRC_FORECAST_YEARS.map((year) => [year, resolveAnnualCapexDefault(year, strategy)])),
    currentNetDebtMillion: rrcQ1_2026Baseline.balanceSheetNetDebtMillion.value,
    dilutedSharesMillion: rrcQ1_2026Baseline.dilutedSharesMillion.value,
    result: runRrcAnnualForecast(defaultRequest)
  });
}

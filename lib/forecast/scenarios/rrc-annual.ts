/**
 * Annual orchestration layer for the simplified RRC Forecast page.
 *
 * This module does not reimplement any calculation: it resolves annual (2026E/2027E/
 * 2028E) user-facing assumptions into the existing quarterly engine's inputs, runs the
 * existing deterministic engine unchanged (via runRrcHedgedScenario, which itself wraps
 * rrc-complete.ts + the hedge settlement calculator + the balance-sheet roll-forward),
 * and aggregates the resulting quarters back into an annual table. The only new
 * calculation here is aggregation (summing 4 quarters) and valuation-date alignment.
 *
 * Default-resolution priority for every editable annual assumption:
 *   1. Management guidance midpoint, when RRC guided that metric for that year.
 *   2. The existing modeled/reported anchor (unchanged from the prior scenario default).
 *   3. An explicit user override, classified "user".
 * Nothing here fabricates a value: when neither guidance nor a user override exists,
 * the existing default flows through untouched, with its existing classification.
 */

import { rrcQ1_2026Baseline } from "@/lib/forecast/data/rrc-baseline";
import { rrcManagementGuidance } from "@/lib/forecast/guidance/rrc";
import { findGuidance, type GuidanceEntry } from "@/lib/forecast/guidance/types";
import { calculateMultipleValuation, calculateDcf, type MultipleValuationResult, type DcfResult } from "@/lib/forecast/valuation";
import { summarizeAnnualProduction, type ProductionOverrideAttribution, type ProductionOverrideInput } from "@/lib/forecast/production-engine";
import { runRrcHedgedScenario } from "@/lib/forecast/scenarios/rrc-hedged";
import type {
  RrcAnnualOverride,
  RrcAnnualOverrides,
  RrcCurrentMarketPrices,
  RrcPost2027Strategy
} from "@/lib/forecast/scenarios/rrc-complete";
import type { AssumptionClassification, ForecastPeriodResult, SourcedValue } from "@/lib/forecast/types";

export const RRC_FORECAST_YEARS = ["2026", "2027", "2028"] as const;
export type RrcForecastYear = (typeof RRC_FORECAST_YEARS)[number];

export type RrcCommodityMode = "current-market" | "custom";

export type RrcAnnualProductionInput = { totalBcfePerDay?: number };
export type RrcAnnualCostsInput = {
  loePerMcfe?: number;
  gatheringTransportPerMcfe?: number;
  /** $/Mcfe, matching how RRC guides G&A -- converted to an annual $mm figure internally using that year's resolved production. */
  cashGaPerMcfe?: number;
  explorationMillion?: number;
  cashInterestMillion?: number;
  cashTaxRate?: number;
};
export type RrcAnnualCapexInput = { totalMillion?: number };
export type RrcCustomCommodityInput = { henryHubPerMmbtu?: number; wtiPerBbl?: number; nglPerBbl?: number };

export type RrcAnnualForecastRequest = {
  strategy: RrcPost2027Strategy;
  production: Partial<Record<RrcForecastYear, RrcAnnualProductionInput>>;
  costs: Partial<Record<RrcForecastYear, RrcAnnualCostsInput>>;
  capex: Partial<Record<RrcForecastYear, RrcAnnualCapexInput>>;
  commodityMode: RrcCommodityMode;
  customCommodity?: RrcCustomCommodityInput;
  /** Already-resolved current-market SourcedValues (classification "live"), e.g. from buildCurrentMarketPricesFromMarketResponse -- passed through unchanged. */
  liveCommodity?: RrcCurrentMarketPrices;
  valuation: {
    targetEvToEbitdax: number;
    forwardYear: RrcForecastYear;
    netDebtMillionOverride?: number;
    dilutedSharesMillionOverride?: number;
  };
};

export type ResolvedAnnualValue = {
  value: number | null;
  classification: AssumptionClassification;
  sourceName: string;
  sourceReference: string;
  sourceDate: string;
  notes: string;
};

export type RrcAnnualPeriodSummary = {
  year: RrcForecastYear;
  production: { gasMmcf: number | null; nglMbbl: number | null; oilMbbl: number | null; totalMcfe: number | null };
  revenueMillion: number | null;
  ebitdaxMillion: number | null;
  capexMillion: number | null;
  freeCashFlowMillion: number | null;
  fcfYield: number | null;
};

export type RrcAnnualValuationResult = MultipleValuationResult & {
  forwardYear: RrcForecastYear;
  forwardEbitdaxMillion: number | null;
  netDebtMillion: number | null;
  netDebtPeriod: string;
  ebitdaxPeriod: string;
  dilutedSharesMillion: number | null;
};

export type RrcAnnualForecastResult = {
  strategy: RrcPost2027Strategy;
  quarterly: ForecastPeriodResult[];
  annual: Record<RrcForecastYear, RrcAnnualPeriodSummary>;
  productionResolution: Record<RrcForecastYear, ResolvedAnnualValue>;
  valuation: RrcAnnualValuationResult;
  /** Secondary/advanced output only -- not the primary Forecast valuation. Uses the current (Q1 2026) reported net debt, not a future ending net debt, so cash flows aren't NPV'd and then double-counted against their own future debt paydown. */
  dcf: DcfResult & { discountRate: number; terminalGrowthRate: number };
  notes: string[];
};

function guidanceToResolved(guidance: GuidanceEntry): ResolvedAnnualValue {
  return {
    value: guidance.midpoint,
    classification: "guided",
    sourceName: guidance.sourceName,
    sourceReference: guidance.sourceReference,
    sourceDate: guidance.sourceDate,
    notes: guidance.notes ?? ""
  };
}

/** Priority 1 (guidance) -> priority 2 (existing modeled/reported anchor) for total company production. Never priority 3 here -- user overrides are handled by the caller before this is consulted. */
export function resolveAnnualProductionDefault(year: RrcForecastYear): ResolvedAnnualValue {
  const guidance = findGuidance(rrcManagementGuidance, "totalProductionBcfePerDay", year);
  if (guidance && guidance.midpoint !== null) return guidanceToResolved(guidance);
  const reported = rrcQ1_2026Baseline.totalProductionBcfePerDay;
  return {
    value: reported.value,
    classification: reported.source.classification,
    sourceName: reported.source.name,
    sourceReference: reported.source.reference ?? "",
    sourceDate: reported.source.retrievedAt,
    notes: `Latest reported total production (Q1 2026), held flat -- RRC did not guide total production for ${year}.`
  };
}

/**
 * loePerMcfe and cashGaPerMcfe mirror rrc-complete.ts exactly: RRC only guided 2026, but
 * the engine holds that guided rate flat across every non-Q1 period regardless of year
 * (there is no year-gating for these two fields there), so the reference default here
 * looks up the 2026 guidance entry for every requested year too -- never a stale reported
 * anchor for 2027/2028, since the engine never falls back to one for those years either.
 * cashTaxRate IS year-gated in the engine (2026 guided, 2027/2028 an explicit modeled
 * ramp), so it alone is looked up per-year.
 */
function resolveFlatGuidanceAcrossYears(metric: "loePerMcfe" | "cashGaPerMcfe"): ResolvedAnnualValue {
  const guidance = findGuidance(rrcManagementGuidance, metric, "2026");
  if (guidance && guidance.midpoint !== null) return { ...guidanceToResolved(guidance), notes: `${guidance.notes ?? ""} Held flat across 2026-2028; RRC did not issue separate 2027/2028 guidance.`.trim() };
  return { value: null, classification: "modeled", sourceName: "RRC Peer Dashboard", sourceReference: "Scenario convention", sourceDate: "2026-08-04", notes: "No guidance available for this metric." };
}

function resolveCashTaxRateDefault(year: RrcForecastYear): ResolvedAnnualValue {
  const guidance = findGuidance(rrcManagementGuidance, "cashTaxRate", year);
  if (guidance && guidance.midpoint !== null) return guidanceToResolved(guidance);
  return {
    value: year === "2027" ? 0.06 : 0.08,
    classification: "modeled",
    sourceName: "RRC Peer Dashboard",
    sourceReference: "Scenario convention",
    sourceDate: "2026-08-04",
    notes: `Modeled scenario cash tax rate as NOL shelter is used up; RRC has not guided a rate for ${year}.`
  };
}

export function resolveAnnualCostDefaults(year: RrcForecastYear): Record<"loePerMcfe" | "cashGaPerMcfe" | "cashTaxRate", ResolvedAnnualValue> {
  return {
    loePerMcfe: resolveFlatGuidanceAcrossYears("loePerMcfe"),
    cashGaPerMcfe: resolveFlatGuidanceAcrossYears("cashGaPerMcfe"),
    cashTaxRate: resolveCashTaxRateDefault(year)
  };
}

export function resolveAnnualCapexDefault(year: RrcForecastYear, strategy: RrcPost2027Strategy): ResolvedAnnualValue {
  const guidance = findGuidance(rrcManagementGuidance, "capexTotalMillion", year);
  if (guidance && guidance.midpoint !== null && !(year === "2028" && strategy === "continued-growth")) return guidanceToResolved(guidance);
  return {
    value: 675,
    classification: "modeled",
    sourceName: "RRC Peer Dashboard",
    sourceReference: "Scenario convention",
    sourceDate: "2026-08-04",
    notes: "No 2028 continued-growth capital figure is guided; modeled as a continuation of the 2026-2027 capital level."
  };
}

const DAYS_PER_YEAR = 365;

function totalMmcfePerDay(gas: number, ngl: number, oil: number): number {
  return gas + (ngl + oil) * 6;
}

/** Splits an annual total-Bcfe/d target into quarterly gas/NGL/oil overrides using the latest reported Q1 2026 product mix ratio -- the same method an analyst uses when management guides only a total production number. */
function expandAnnualProductionToQuarterlyOverrides(
  year: RrcForecastYear,
  totalBcfePerDay: number,
  attribution: ProductionOverrideAttribution
): ProductionOverrideInput[] {
  const reportedGas = rrcQ1_2026Baseline.naturalGasMmcfPerDay.value;
  const reportedNgl = rrcQ1_2026Baseline.nglMbblPerDay.value;
  const reportedOil = rrcQ1_2026Baseline.oilMbblPerDay.value;
  if (reportedGas === null || reportedNgl === null || reportedOil === null) return [];
  const reportedTotal = totalMmcfePerDay(reportedGas, reportedNgl, reportedOil);
  if (reportedTotal <= 0) return [];
  const scale = (totalBcfePerDay * 1000) / reportedTotal;
  const gasMmcfPerDay = reportedGas * scale;
  const nglMbblPerDay = reportedNgl * scale;
  const oilMbblPerDay = reportedOil * scale;
  return [1, 2, 3, 4].map((quarter) => ({
    period: `${year}Q${quarter}`,
    gasMmcfPerDay,
    nglMbblPerDay,
    oilMbblPerDay,
    attribution
  }));
}

function userSourced(value: number | undefined, unit: string, notes: string): SourcedValue | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return {
    value,
    unit,
    source: { name: "User input", period: "user-entered", retrievedAt: new Date().toISOString(), classification: "user", notes }
  };
}

/** Resolves an RrcAnnualForecastRequest into the exact inputs runRrcHedgedScenario already accepts -- no new engine logic, only assumption resolution. */
export function resolveRrcAnnualInputs(request: RrcAnnualForecastRequest): {
  productionOverrides: ProductionOverrideInput[];
  currentMarketPrices: RrcCurrentMarketPrices;
  annualOverrides: RrcAnnualOverrides;
  productionResolution: Record<RrcForecastYear, ResolvedAnnualValue>;
} {
  const productionOverrides: ProductionOverrideInput[] = [];
  const productionResolution = {} as Record<RrcForecastYear, ResolvedAnnualValue>;

  for (const year of RRC_FORECAST_YEARS) {
    const userTotal = request.production[year]?.totalBcfePerDay;
    if (typeof userTotal === "number" && Number.isFinite(userTotal)) {
      productionResolution[year] = {
        value: userTotal,
        classification: "user",
        sourceName: "User input",
        sourceReference: "",
        sourceDate: new Date().toISOString(),
        notes: "User-entered annual total production target."
      };
      productionOverrides.push(
        ...expandAnnualProductionToQuarterlyOverrides(year, userTotal, {
          classification: "user",
          sourceName: "User production assumption",
          notePrefix: `User-entered ${year} total production target (${userTotal} Bcfe/d), split into gas/NGL/oil using the latest reported product mix.`
        })
      );
      continue;
    }

    const resolved = resolveAnnualProductionDefault(year);
    productionResolution[year] = resolved;
    if (resolved.classification === "guided" && resolved.value !== null) {
      productionOverrides.push(
        ...expandAnnualProductionToQuarterlyOverrides(year, resolved.value, {
          classification: "guided",
          sourceName: resolved.sourceName,
          sourceReference: resolved.sourceReference,
          notePrefix: `Management guidance ${year} total production target (${resolved.value} Bcfe/d), split into gas/NGL/oil using the latest reported product mix.`
        })
      );
    }
    // else: no guidance and no user input -- leave the existing flat-hold-of-latest-reported default untouched (no override pushed).
  }

  const currentMarketPrices: RrcCurrentMarketPrices =
    request.commodityMode === "current-market"
      ? request.liveCommodity ?? {}
      : {
          henryHubPerMmbtu: userSourced(request.customCommodity?.henryHubPerMmbtu, "$/MMBtu", "User-entered custom Henry Hub price."),
          wtiPerBbl: userSourced(request.customCommodity?.wtiPerBbl, "$/bbl", "User-entered custom WTI price."),
          nglPerBbl: userSourced(request.customCommodity?.nglPerBbl, "$/bbl", "User-entered custom NGL realization.")
        };

  const annualOverrides: RrcAnnualOverrides = {};
  for (const year of RRC_FORECAST_YEARS) {
    const costs = request.costs[year];
    const capex = request.capex[year];
    const totalBcfePerDay = productionResolution[year]?.value;
    const cashGaPerMcfeInput = costs?.cashGaPerMcfe;
    const cashGaMillion =
      typeof cashGaPerMcfeInput === "number" && Number.isFinite(cashGaPerMcfeInput) && typeof totalBcfePerDay === "number" && Number.isFinite(totalBcfePerDay)
        ? userSourced(
            totalBcfePerDay * DAYS_PER_YEAR * cashGaPerMcfeInput,
            "$mm",
            `User-entered $${cashGaPerMcfeInput}/Mcfe G&A assumption, converted to an annual dollar figure using this year's ${totalBcfePerDay} Bcfe/d resolved production (${DAYS_PER_YEAR}-day approximation).`
          )
        : undefined;
    const entry: RrcAnnualOverride = {
      loePerMcfe: userSourced(costs?.loePerMcfe, "$/Mcfe", "User-entered LOE assumption."),
      gatheringTransportPerMcfe: userSourced(costs?.gatheringTransportPerMcfe, "$/Mcfe", "User-entered gathering/transport/processing assumption."),
      cashGaMillion,
      explorationMillion: userSourced(costs?.explorationMillion, "$mm", "User-entered exploration expense assumption."),
      cashInterestMillion: userSourced(costs?.cashInterestMillion, "$mm", "User-entered cash interest assumption."),
      cashTaxRate: userSourced(costs?.cashTaxRate, "decimal", "User-entered cash tax rate assumption."),
      capexTotalMillion: userSourced(capex?.totalMillion, "$mm", "User-entered annual capex assumption.")
    };
    if (Object.values(entry).some((v) => v !== undefined)) annualOverrides[year] = entry;
  }

  return { productionOverrides, currentMarketPrices, annualOverrides, productionResolution };
}

function sumQuarterly(periods: ForecastPeriodResult[], select: (p: ForecastPeriodResult) => number | null): number | null {
  if (periods.length !== 4) return null;
  const values = periods.map(select);
  if (values.some((v) => v === null)) return null;
  return (values as number[]).reduce((sum, v) => sum + v, 0);
}

function annualSummary(year: RrcForecastYear, periods: ForecastPeriodResult[], forwardYear: RrcForecastYear, forwardYearFcf: number | null, forwardYearEquityValue: number | null): RrcAnnualPeriodSummary {
  const production = summarizeAnnualProduction(periods.map((p) => ({ volumes: p.production })));
  const freeCashFlowMillion = sumQuarterly(periods, (p) => p.freeCashFlowMillion);
  const fcfYield =
    year === forwardYear && forwardYearFcf !== null && forwardYearEquityValue !== null && forwardYearEquityValue > 0
      ? forwardYearFcf / forwardYearEquityValue
      : null;

  return {
    year,
    production: { gasMmcf: production.gasMmcf, nglMbbl: production.nglMbbl, oilMbbl: production.oilMbbl, totalMcfe: production.totalMcfe },
    revenueMillion: sumQuarterly(periods, (p) => p.revenue.totalMillion),
    ebitdaxMillion: sumQuarterly(periods, (p) => p.ebitdaxMillion),
    capexMillion: sumQuarterly(periods, (p) => p.capex.totalMillion),
    freeCashFlowMillion,
    fcfYield
  };
}

const DEFAULT_DCF_DISCOUNT_RATE = 0.1;
const DEFAULT_DCF_TERMINAL_GROWTH_RATE = 0;

export function runRrcAnnualForecast(request: RrcAnnualForecastRequest): RrcAnnualForecastResult {
  const { productionOverrides, currentMarketPrices, annualOverrides, productionResolution } = resolveRrcAnnualInputs(request);
  const { forecast, balanceSheet, notes } = runRrcHedgedScenario(request.strategy, {
    productionOverrides,
    currentMarketPrices,
    annualOverrides
  });

  const periodsByYear = (year: RrcForecastYear) => forecast.periods.filter((p) => p.period.startsWith(year));

  // --- Valuation-date alignment fix: net debt is read from the SAME year-end as the
  // forward EBITDAX year, never a later (or earlier) period's balance sheet. ---
  const forwardYear = request.valuation.forwardYear;
  const forwardEbitdaxMillion = sumQuarterly(periodsByYear(forwardYear), (p) => p.ebitdaxMillion);
  const netDebtPeriod = `${forwardYear}Q4`;
  const balanceSheetAtForwardYearEnd = balanceSheet.find((b) => b.period === netDebtPeriod) ?? null;
  const netDebtMillion = request.valuation.netDebtMillionOverride ?? balanceSheetAtForwardYearEnd?.netDebtMillion ?? null;
  const dilutedSharesMillion = request.valuation.dilutedSharesMillionOverride ?? rrcQ1_2026Baseline.dilutedSharesMillion.value;

  const multiple = calculateMultipleValuation({
    forecastEbitdaxMillion: forwardEbitdaxMillion,
    targetEvToEbitdax: request.valuation.targetEvToEbitdax,
    netDebtMillion,
    dilutedSharesMillion
  });

  const valuation: RrcAnnualValuationResult = {
    ...multiple,
    forwardYear,
    forwardEbitdaxMillion,
    netDebtMillion,
    netDebtPeriod,
    ebitdaxPeriod: `${forwardYear} (Q1-Q4)`,
    dilutedSharesMillion
  };

  const forwardYearFcf = sumQuarterly(periodsByYear(forwardYear), (p) => p.freeCashFlowMillion);

  const annual = Object.fromEntries(
    RRC_FORECAST_YEARS.map((year) => [year, annualSummary(year, periodsByYear(year), forwardYear, forwardYearFcf, multiple.equityValueMillion)])
  ) as Record<RrcForecastYear, RrcAnnualPeriodSummary>;

  // Secondary/advanced DCF only. Fixes the same class of valuation-date bug: the prior
  // implementation subtracted the *ending* (2028) net debt from a value derived by
  // discounting future cash flows back to today, double counting the FCF-funded debt
  // paydown those cash flows already represent. This uses today's (Q1 2026 reported)
  // net debt instead, the correct DCF convention.
  const dcf = calculateDcf({
    annualFreeCashFlowMillion: RRC_FORECAST_YEARS.map((year, index) => ({ year: 2026 + index, value: annual[year].freeCashFlowMillion })),
    discountRate: DEFAULT_DCF_DISCOUNT_RATE,
    terminalGrowthRate: DEFAULT_DCF_TERMINAL_GROWTH_RATE,
    netDebtMillion: rrcQ1_2026Baseline.balanceSheetNetDebtMillion.value,
    dilutedSharesMillion
  });

  return {
    strategy: request.strategy,
    quarterly: forecast.periods,
    annual,
    productionResolution,
    valuation,
    dcf: { ...dcf, discountRate: DEFAULT_DCF_DISCOUNT_RATE, terminalGrowthRate: DEFAULT_DCF_TERMINAL_GROWTH_RATE },
    notes: [
      ...notes,
      `Valuation uses ${forwardYear} EBITDAX (sum of ${forwardYear} Q1-Q4) against net debt at ${netDebtPeriod} -- the same period's ending balance sheet, not a later or earlier year's.`,
      "The secondary DCF output uses today's reported net debt, not a future ending net debt, to avoid double-counting FCF-funded debt paydown."
    ]
  };
}

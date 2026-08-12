/**
 * Annual orchestration layer for the simplified RRC Forecast page.
 *
 * This module does not reimplement any calculation: it resolves annual (2026E/2027E/
 * 2028E) user-facing assumptions into the existing quarterly engine's inputs, runs the
 * existing deterministic engine unchanged (via runRrcHedgedScenario, which itself wraps
 * rrc-complete.ts + the hedge settlement calculator + the balance-sheet roll-forward),
 * and aggregates the resulting quarters back into an annual table. The only new
 * calculation here is aggregation (summing 4 quarters), H2 2026 reconciliation (see
 * resolveRrc2026ProductionPlan / resolveRrc2026CapexOverride), and valuation-date alignment.
 *
 * 2026E = Q1 2026 actual + Q2 2026 actual + Q3 2026 estimate + Q4 2026 estimate. Q1/Q2 are
 * immutable reported quarters (rrc-complete.ts's applyActualQuarterOverrides plugs the real
 * reported revenue/EBITDAX/CapEx/FCF/production directly; they are never re-run through
 * forecast assumptions). 2027E and 2028E remain fully forecast years. See
 * lib/forecast/data/rrc-actuals.ts for the canonical reported-actuals adapter.
 *
 * Default-resolution priority for every editable annual assumption:
 *   1. Management guidance midpoint, when RRC guided that metric for that year (current
 *      Q2 2026 reporting cycle -- see lib/forecast/guidance/rrc.ts).
 *   2. The existing modeled/reported anchor (unchanged from the prior scenario default).
 *   3. An explicit user override, classified "user".
 * Nothing here fabricates a value: when neither guidance nor a user override exists,
 * the existing default flows through untouched, with its existing classification.
 */

import { rrcQ1_2026Baseline } from "@/lib/forecast/data/rrc-baseline";
import { rrcActualQuarters } from "@/lib/forecast/data/rrc-actuals";
import { rrcManagementGuidance, rrcQ3_2026GuidedBcfePerDay } from "@/lib/forecast/guidance/rrc";
import { findGuidance, type GuidanceEntry } from "@/lib/forecast/guidance/types";
import { calculateMultipleValuation, calculateDcf, type MultipleValuationResult, type DcfResult } from "@/lib/forecast/valuation";
import {
  buildFlatProductionForecast,
  summarizeAnnualProduction,
  type ProductionOverrideAttribution,
  type ProductionOverrideInput
} from "@/lib/forecast/production-engine";
import { runRrcHedgedScenario } from "@/lib/forecast/scenarios/rrc-hedged";
import { latestReportedProduction, modeledCashTaxRateForYear, quarterDays } from "@/lib/forecast/scenarios/rrc-complete";
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

export type RrcAnnualProductionInput = {
  totalBcfePerDay?: number;
  /**
   * Optional per-commodity go-forward daily rate overrides (Custom Production & Prices).
   * Each is independent: setting only one commodity leaves the other two on the Default
   * Forecast rate for that year. For 2026, this rate applies to Q3/Q4 only -- Q1/Q2 2026
   * actuals are always immutable. For 2027/2028 (no actual/estimate split), it applies to
   * the full year. Not reconciled against a full-year target the way totalBcfePerDay is
   * for 2026 (there is no independently reported Q1/Q2 2026 per-commodity actual to
   * reconcile against -- see rrc-actuals.ts), so this is a direct flat rate, the same
   * convention every other Custom override in this engine already uses.
   */
  gasMmcfPerDay?: number;
  nglMbblPerDay?: number;
  oilMbblPerDay?: number;
};
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
/** Realized gas price = Henry Hub + gasBasisPerMcf; realized oil price = WTI + oilDifferentialPerBbl. Sign exactly as disclosed by management. */
export type RrcAnnualPricingInput = { gasBasisPerMcf?: number; oilDifferentialPerBbl?: number };
export type RrcCustomCommodityInput = { henryHubPerMmbtu?: number; wtiPerBbl?: number; nglPerBbl?: number };

export type RrcAnnualForecastRequest = {
  strategy: RrcPost2027Strategy;
  production: Partial<Record<RrcForecastYear, RrcAnnualProductionInput>>;
  costs: Partial<Record<RrcForecastYear, RrcAnnualCostsInput>>;
  capex: Partial<Record<RrcForecastYear, RrcAnnualCapexInput>>;
  pricing: Partial<Record<RrcForecastYear, RrcAnnualPricingInput>>;
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
  /** Ending net debt (negative = net cash) at this year's Q4, straight from the balance-sheet roll-forward -- never floored. 2026Q1/Q2 use the reported net debt directly; not the same as valuation.netDebtMillion, which is a floored convention applied only at the selected forward valuation year. */
  endingNetDebtMillion: number | null;
};

export type RrcAnnualValuationResult = MultipleValuationResult & {
  forwardYear: RrcForecastYear;
  forwardEbitdaxMillion: number | null;
  /**
   * Net debt actually used in the EV/EBITDAX equity-value bridge above (equityValueMillion
   * = enterpriseValueMillion - netDebtMillion). Floored at $0 -- see
   * valuationNetDebtFloorApplied and forecastEndingNetDebtMillion below -- unless the
   * caller supplied an explicit netDebtMillionOverride, which is never floored.
   */
  netDebtMillion: number | null;
  /** The TRUE forecast ending net debt (negative = net cash) at netDebtPeriod, exactly as the balance-sheet roll-forward produced it -- never floored, never hidden. This is what the forecast actually projects; netDebtMillion above is a separate, deliberately conservative valuation convention layered on top of it. */
  forecastEndingNetDebtMillion: number | null;
  /**
   * True when forecastEndingNetDebtMillion was negative (net cash) and therefore floored to
   * $0 for the EV/EBITDAX bridge, because this model does not simulate buybacks, special
   * dividends, acquisitions, or other capital allocation of unmodeled excess free cash flow.
   * Valuation net debt is floored at $0; unallocated forecast excess cash is not credited to
   * implied equity value. Always false when a netDebtMillionOverride was supplied.
   */
  valuationNetDebtFloorApplied: boolean;
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
  // Total production has a valid Q2 2026 actual (unlike the gas/NGL/oil mix, LOE, GP&T,
  // etc., which stay Q1-anchored -- see rrc-baseline.ts), so the reported-anchor fallback
  // for a year with no guidance uses the latest reported TOTAL, Q2, not Q1.
  const q2 = rrcActualQuarters["2026Q2"];
  return {
    value: q2.totalProductionMmcfePerDay === null ? null : q2.totalProductionMmcfePerDay / 1000,
    classification: "reported",
    sourceName: "Range Resources",
    sourceReference: "Q2 2026 10-Q",
    sourceDate: "2026-08-04",
    notes: `Latest reported total production (Q2 2026), held flat -- RRC did not guide total production for ${year}.`
  };
}

/**
 * loePerMcfe and cashGaPerMcfe mirror rrc-complete.ts exactly: RRC only guided 2026, but
 * the engine holds that guided rate flat across every non-Q1 period regardless of year
 * (there is no year-gating for these two fields there), so the reference default here
 * looks up the 2026 guidance entry for every requested year too -- never a stale reported
 * anchor for 2027/2028, since the engine never falls back to one for those years either.
 * cashTaxRate IS year-gated in the engine (an explicit modeled 2%/6%/8% ramp because
 * management did not guide a current-cycle rate), so it alone is resolved per-year.
 */
function resolveFlatGuidanceAcrossYears(metric: "loePerMcfe" | "cashGaPerMcfe"): ResolvedAnnualValue {
  const guidance = findGuidance(rrcManagementGuidance, metric, "2026");
  if (guidance && guidance.midpoint !== null) return { ...guidanceToResolved(guidance), notes: `${guidance.notes ?? ""} Held flat across 2026-2028; RRC did not issue separate 2027/2028 guidance.`.trim() };
  return { value: null, classification: "modeled", sourceName: "RRC Peer Dashboard", sourceReference: "Scenario convention", sourceDate: "2026-08-04", notes: "No guidance available for this metric." };
}

function resolveCashTaxRateDefault(year: RrcForecastYear): ResolvedAnnualValue {
  const guidance = findGuidance(rrcManagementGuidance, "cashTaxRate", year);
  if (guidance && guidance.midpoint !== null) return guidanceToResolved(guidance);
  // Shared with rrc-complete.ts's own periodAssumptions via modeledCashTaxRateForYear so
  // this reference-panel default can never silently diverge from what the engine actually
  // computes with (a numeric-year comparison, not a "2026"-string one that can typo-match
  // the wrong branch).
  return {
    value: modeledCashTaxRateForYear(Number(year)),
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

/**
 * 2026 CapEx H2 reconciliation: full-year target (user override, else management's guided
 * FY2026 midpoint) less Q1 and Q2 actual reported CapEx gives the required H2 total, split
 * evenly across Q3/Q4 (RRC's Q3/Q4 2026 CapEx guidance is qualitative only -- no explicit
 * phasing -- so an even split is the simplest defensible method per the product spec).
 *
 * rrc-complete.ts's capexTotalMillion override slot is a single per-quarter figure applied
 * flat across all 4 quarters of a year (annual total / 4). Q1/Q2's resulting figure is
 * discarded regardless by applyActualQuarterOverrides, so feeding 4x the desired H2
 * per-quarter rate here makes that existing mechanism produce exactly the right Q3/Q4
 * number without changing rrc-complete.ts's per-quarter contract or adding a new one.
 * resolveAnnualCapexDefault (above) remains the source of truth for the TRUE annual total
 * shown in the UI/reference panel; this function only feeds the engine.
 */
function resolveRrc2026CapexOverride(userAnnualTotalMillion?: number): SourcedValue | undefined {
  const guidance = findGuidance(rrcManagementGuidance, "capexTotalMillion", "2026");
  const usingUser = typeof userAnnualTotalMillion === "number" && Number.isFinite(userAnnualTotalMillion);
  const fullYearTarget = usingUser ? (userAnnualTotalMillion as number) : guidance?.midpoint ?? null;
  if (fullYearTarget === null) return undefined;

  const q1Actual = rrcActualQuarters["2026Q1"].capexMillion;
  const q2Actual = rrcActualQuarters["2026Q2"].capexMillion;
  if (q1Actual === null || q2Actual === null) return undefined;

  const h2Required = fullYearTarget - q1Actual - q2Actual;
  const h2Clamped = h2Required < 0;
  const h2PerQuarter = Math.max(0, h2Required) / 2;

  const classification: "user" | "guided" = usingUser ? "user" : "guided";
  const sourceName = usingUser ? "User input" : guidance!.sourceName;
  const sourceReference = usingUser ? "" : guidance!.sourceReference;
  const targetDescription = usingUser
    ? `User-entered full-year 2026 CapEx target ($${fullYearTarget}mm)`
    : `Management's guided full-year 2026 capital budget midpoint ($${fullYearTarget}mm${guidance?.low !== null && guidance?.high !== null ? `, range $${guidance?.low}-$${guidance?.high}mm` : ""})`;

  return {
    value: h2PerQuarter * 4,
    unit: "$mm",
    source: {
      name: sourceName,
      reference: sourceReference,
      period: "2026",
      retrievedAt: usingUser ? new Date().toISOString() : guidance!.sourceDate,
      classification,
      notes:
        `${targetDescription} reconciled to H2 2026: full-year target less Q1 actual ($${q1Actual}mm) and Q2 actual ($${q2Actual}mm) CapEx` +
        (h2Clamped ? "; H1 actual CapEx already met or exceeded the full-year target, so H2 was floored at $0 pending updated guidance." : ".") +
        ` No source-backed Q3/Q4 phasing exists, so the $${h2PerQuarter.toFixed(1)}mm required H2 total is split evenly across Q3/Q4. Modeled from guidance, not itself a directly reported or directly guided quarterly figure.`
    }
  };
}

const MODELED_PRICING_FALLBACKS: Record<"gasBasisPerMcf" | "oilDifferentialPerBbl", { value: number; unit: string }> = {
  gasBasisPerMcf: { value: 0.18, unit: "$/Mcf" },
  oilDifferentialPerBbl: { value: -10.68, unit: "$/bbl" }
};

/** Mirrors rrc-complete.ts exactly: guidance midpoint when RRC guided that differential for the year, else the Q1 2026 reported differential held flat (modeled). Realized gas price = Henry Hub + this value; realized oil price = WTI + this value; sign exactly as disclosed. */
export function resolveAnnualPricingDefault(metric: "gasBasisPerMcf" | "oilDifferentialPerBbl", year: RrcForecastYear): ResolvedAnnualValue {
  const guidance = findGuidance(rrcManagementGuidance, metric, year);
  if (guidance && guidance.midpoint !== null) return guidanceToResolved(guidance);
  const fallback = MODELED_PRICING_FALLBACKS[metric];
  return {
    value: fallback.value,
    classification: "modeled",
    sourceName: "Range Resources",
    sourceReference: "Q1 2026 Form 10-Q realized-pricing disclosure",
    sourceDate: "2026-08-04",
    notes: `Q1 2026 reported differential held flat as the forward anchor; RRC did not guide this differential for ${year}.`
  };
}

export function resolveAnnualPricingDefaults(year: RrcForecastYear): Record<"gasBasisPerMcf" | "oilDifferentialPerBbl", ResolvedAnnualValue> {
  return {
    gasBasisPerMcf: resolveAnnualPricingDefault("gasBasisPerMcf", year),
    oilDifferentialPerBbl: resolveAnnualPricingDefault("oilDifferentialPerBbl", year)
  };
}

function commodityResolved(rate: number | null | undefined, basis: ResolvedAnnualValue, label: string): ResolvedAnnualValue {
  return {
    value: rate === undefined ? null : rate,
    classification: basis.classification,
    sourceName: basis.sourceName,
    sourceReference: basis.sourceReference,
    sourceDate: basis.sourceDate,
    notes: `${label} default rate, split from the Default Forecast total production using the latest reported (Q1 2026) product mix. ${basis.notes}`.trim()
  };
}

/**
 * Default (pre-override) gas/NGL/oil daily production rates for the Custom Production &
 * Prices panel's placeholders -- the exact rate the engine uses by default for that year
 * when the user has not touched that commodity. For 2026 this is the reconciled H2 rate
 * (post Q1/Q2-actual reconciliation, see resolveRrc2026ProductionPlan); for 2027/2028 it
 * is the flat annual rate. Read-only reference values -- computing them here does not
 * change what the engine calculates.
 */
export function resolveAnnualCommodityProductionDefaults(year: RrcForecastYear): {
  gasMmcfPerDay: ResolvedAnnualValue;
  nglMbblPerDay: ResolvedAnnualValue;
  oilMbblPerDay: ResolvedAnnualValue;
} {
  if (year === "2026") {
    const plan = resolveRrc2026ProductionPlan(undefined);
    const rep = plan.overrides.find((o) => o.period === "2026Q3") ?? plan.overrides.find((o) => o.period === "2026Q4");
    return {
      gasMmcfPerDay: commodityResolved(rep?.gasMmcfPerDay, plan.resolved, "Natural gas —"),
      nglMbblPerDay: commodityResolved(rep?.nglMbblPerDay, plan.resolved, "NGL —"),
      oilMbblPerDay: commodityResolved(rep?.oilMbblPerDay, plan.resolved, "Oil/condensate —")
    };
  }
  const total = resolveAnnualProductionDefault(year);
  const split = total.value === null ? null : splitByReportedMix(total.value);
  return {
    gasMmcfPerDay: commodityResolved(split?.gasMmcfPerDay, total, "Natural gas —"),
    nglMbblPerDay: commodityResolved(split?.nglMbblPerDay, total, "NGL —"),
    oilMbblPerDay: commodityResolved(split?.oilMbblPerDay, total, "Oil/condensate —")
  };
}

function totalMmcfePerDay(gas: number, ngl: number, oil: number): number {
  return gas + (ngl + oil) * 6;
}

/** Splits a total-Bcfe/d daily rate into gas/NGL/oil daily rates using the latest reported (Q1 2026) product mix ratio -- the same method an analyst uses when management guides only a total production number. Returns null if the reported mix is unavailable. */
function splitByReportedMix(totalBcfePerDay: number): { gasMmcfPerDay: number; nglMbblPerDay: number; oilMbblPerDay: number } | null {
  const reportedGas = rrcQ1_2026Baseline.naturalGasMmcfPerDay.value;
  const reportedNgl = rrcQ1_2026Baseline.nglMbblPerDay.value;
  const reportedOil = rrcQ1_2026Baseline.oilMbblPerDay.value;
  if (reportedGas === null || reportedNgl === null || reportedOil === null) return null;
  const reportedTotal = totalMmcfePerDay(reportedGas, reportedNgl, reportedOil);
  if (reportedTotal <= 0) return null;
  const scale = (totalBcfePerDay * 1000) / reportedTotal;
  return { gasMmcfPerDay: reportedGas * scale, nglMbblPerDay: reportedNgl * scale, oilMbblPerDay: reportedOil * scale };
}

/** Splits an annual total-Bcfe/d target into quarterly gas/NGL/oil overrides (same flat rate every quarter) using the latest reported Q1 2026 product mix ratio. Used for 2027/2028, which have no actual/estimate split. */
function expandAnnualProductionToQuarterlyOverrides(
  year: RrcForecastYear,
  totalBcfePerDay: number,
  attribution: ProductionOverrideAttribution
): ProductionOverrideInput[] {
  const split = splitByReportedMix(totalBcfePerDay);
  if (!split) return [];
  return [1, 2, 3, 4].map((quarter) => ({
    period: `${year}Q${quarter}`,
    ...split,
    attribution
  }));
}

/**
 * 2026 production build: Q1 and Q2 are immutable reported actuals (never overridden here --
 * applyActualQuarterOverrides in rrc-complete.ts handles them at the output level), so this
 * only produces Q3/Q4 overrides, reconciled so the full year averages to the target rate:
 *
 *   H2 required volume = (full-year target x 365 days) - Q1 actual volume - Q2 actual volume
 *
 * The full-year target is the user's annual override when supplied, else management's guided
 * 2026 midpoint, else (no guidance and no override) no reconciliation is attempted and this
 * returns no overrides -- the engine's existing flat-hold-of-Q1 default applies unchanged,
 * exactly like the pre-Q2-integration behavior for a year with no guidance.
 *
 * Q3 uses management's own guided Q3 2026 rate when available and it does not exceed the H2
 * total (a specific, newer, more precise input than an even split); Q4 absorbs whatever volume
 * remains so the full year reconciles exactly. Without a usable Q3 guide, H2 is split evenly
 * by day count. Derived H2 values are classified "guided" (guidance-driven) or "user"
 * (user-driven), never presented as directly reported management guidance.
 */
function resolveRrc2026ProductionPlan(userAnnualTotalBcfePerDay?: number): {
  resolved: ResolvedAnnualValue;
  overrides: ProductionOverrideInput[];
} {
  const guidance = findGuidance(rrcManagementGuidance, "totalProductionBcfePerDay", "2026");
  const usingUser = typeof userAnnualTotalBcfePerDay === "number" && Number.isFinite(userAnnualTotalBcfePerDay);
  const fullYearTarget = usingUser ? (userAnnualTotalBcfePerDay as number) : guidance?.midpoint ?? null;

  // No guidance and no user override -- reuse the same Q2-anchored flat-hold fallback every
  // other unguided year uses (resolveAnnualProductionDefault already checked guidance and
  // would find none here, so this only re-derives the reported-fallback branch).
  if (fullYearTarget === null) return { resolved: resolveAnnualProductionDefault("2026"), overrides: [] };

  const q1Actual = rrcActualQuarters["2026Q1"];
  const q2Actual = rrcActualQuarters["2026Q2"];
  const q1Days = quarterDays("2026Q1");
  const q2Days = quarterDays("2026Q2");
  const q3Days = quarterDays("2026Q3");
  const q4Days = quarterDays("2026Q4");

  if (q1Actual.totalProductionMmcfePerDay === null || q2Actual.totalProductionMmcfePerDay === null) {
    return {
      resolved: {
        value: fullYearTarget,
        classification: usingUser ? "user" : "guided",
        sourceName: usingUser ? "User input" : guidance!.sourceName,
        sourceReference: usingUser ? "" : guidance!.sourceReference,
        sourceDate: usingUser ? new Date().toISOString() : guidance!.sourceDate,
        notes: "Q1/Q2 2026 actual production is unavailable, so the full-year target could not be reconciled to a required H2 volume; H2 production was left at the existing flat-hold default rather than estimated."
      },
      overrides: []
    };
  }

  const q1Volume = q1Actual.totalProductionMmcfePerDay * q1Days;
  const q2Volume = q2Actual.totalProductionMmcfePerDay * q2Days;
  const fullYearVolume = fullYearTarget * 1000 * (q1Days + q2Days + q3Days + q4Days);
  const h2RequiredVolume = Math.max(0, fullYearVolume - q1Volume - q2Volume);
  const h2Clamped = fullYearVolume - q1Volume - q2Volume < 0;

  const q3Guided = rrcQ3_2026GuidedBcfePerDay();
  const q3VolumeFromGuide = q3Guided !== null ? q3Guided * 1000 * q3Days : null;
  const usedQ3Guide = q3VolumeFromGuide !== null && q3VolumeFromGuide <= h2RequiredVolume;
  const q3Volume = usedQ3Guide ? (q3VolumeFromGuide as number) : h2RequiredVolume / 2;
  const q4Volume = h2RequiredVolume - q3Volume;
  const q3Rate = q3Volume / 1000 / q3Days;
  const q4Rate = q4Volume / 1000 / q4Days;

  const classification: "user" | "guided" = usingUser ? "user" : "guided";
  const sourceName = usingUser ? "User input" : guidance!.sourceName;
  const sourceReference = usingUser ? "" : guidance!.sourceReference;
  const sourceDate = usingUser ? new Date().toISOString() : guidance!.sourceDate;
  const targetDescription = usingUser
    ? `User-entered full-year 2026 production target (${fullYearTarget} Bcfe/d)`
    : `Management's guided full-year 2026 production midpoint (${fullYearTarget} Bcfe/d${guidance?.low !== null && guidance?.high !== null ? `, range ${guidance?.low}-${guidance?.high}` : ""})`;
  const reconciliationNote =
    `${targetDescription} reconciled to H2 2026: full-year target volume less Q1 actual (${q1Actual.totalProductionMmcfePerDay.toFixed(1)} MMcfe/d x ${q1Days} days) and Q2 actual (${q2Actual.totalProductionMmcfePerDay.toFixed(1)} MMcfe/d x ${q2Days} days)` +
    (h2Clamped ? "; H1 actuals already met or exceeded the full-year target, so H2 was floored at 0 pending updated guidance." : ".") +
    (usedQ3Guide ? ` Q3 2026 uses management's own guided Q3 rate (~${q3Guided} Bcfe/d); Q4 absorbs the reconciling remainder.` : " No usable Q3-specific guidance; the H2 volume was split evenly across Q3/Q4 by day count.") +
    " Modeled from guidance, not itself a directly reported or directly guided quarterly figure.";

  function buildOverride(period: string, rate: number): ProductionOverrideInput[] {
    const split = splitByReportedMix(rate);
    if (!split) return [];
    return [
      {
        period,
        ...split,
        attribution: {
          classification,
          sourceName,
          sourceReference,
          notePrefix: `${reconciliationNote} ${period} resolved rate: ${rate.toFixed(3)} Bcfe/d, split into gas/NGL/oil using the latest reported product mix.`
        }
      }
    ];
  }

  return {
    resolved: { value: fullYearTarget, classification, sourceName, sourceReference, sourceDate, notes: reconciliationNote },
    overrides: [...buildOverride("2026Q3", q3Rate), ...buildOverride("2026Q4", q4Rate)]
  };
}

/**
 * Computes the exact annual production volume (MMcfe) the forecast engine will produce for
 * a year, using the same production overrides and the same buildFlatProductionForecast call
 * the engine itself makes internally (rrc-complete.ts calls it once across all 12 quarters;
 * per-quarter results are independent of what happens in other years, so filtering the same
 * overrides down to one year's 4 quarters reproduces identical numbers). A $/Mcfe cost
 * conversion (e.g. G&A) can then use precisely the volume basis Revenue will use for that
 * year, instead of a separate approximation that could drift from the real reconciled total.
 */
function annualMcfeForYear(year: RrcForecastYear, productionOverrides: ProductionOverrideInput[]): number | null {
  const periods = [1, 2, 3, 4].map((quarter) => {
    const period = `${year}Q${quarter}`;
    return { period, days: quarterDays(period) };
  });
  const yearOverrides = productionOverrides.filter((override) => override.period.startsWith(year));
  const flatProduction = buildFlatProductionForecast(latestReportedProduction, periods, yearOverrides);
  const summary = summarizeAnnualProduction(flatProduction.map((period) => ({ volumes: period.volumes })));
  return summary.totalMcfe;
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

    if (year === "2026") {
      // 2026 = Q1 actual + Q2 actual + Q3E + Q4E: only Q3/Q4 are ever overridden here: Q1/Q2
      // are immutable and handled at the output level by applyActualQuarterOverrides.
      const plan = resolveRrc2026ProductionPlan(userTotal);
      productionResolution[year] = plan.resolved;
      productionOverrides.push(...plan.overrides);
      continue;
    }

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

  // Per-commodity Custom Production & Prices overrides: an independent overlay on top of
  // the total-production-driven overrides just built above. Only the commodities the user
  // actually entered are replaced; anything not entered keeps whatever the Default Forecast
  // pass above already resolved for that quarter (guided/default split, or the engine's own
  // reported-baseline hold when neither guidance nor an override exists). Because a single
  // override entry carries one attribution for whichever fields are set on it, a quarter
  // that mixes one user-touched commodity with two already-defaulted ones will show "user"
  // classification/notes on the whole entry in the engine's internal source metadata -- a
  // labeling nuance in unexposed diagnostic notes, not a numeric fabrication; the resolved
  // dollar values themselves are exactly the default for the untouched commodities.
  for (const year of RRC_FORECAST_YEARS) {
    const override = request.production[year];
    if (!override) continue;
    const { gasMmcfPerDay, nglMbblPerDay, oilMbblPerDay } = override;
    if (gasMmcfPerDay === undefined && nglMbblPerDay === undefined && oilMbblPerDay === undefined) continue;

    const quarters = year === "2026" ? ["2026Q3", "2026Q4"] : [`${year}Q1`, `${year}Q2`, `${year}Q3`, `${year}Q4`];
    for (const period of quarters) {
      let entry = productionOverrides.find((o) => o.period === period);
      if (!entry) {
        entry = { period };
        productionOverrides.push(entry);
      }
      entry.attribution = {
        classification: "user",
        sourceName: "User production assumption",
        notePrefix: "User-entered Custom Production & Prices override for this commodity; untouched commodities in this period keep the Default Forecast rate."
      };
      if (gasMmcfPerDay !== undefined) entry.gasMmcfPerDay = gasMmcfPerDay;
      if (nglMbblPerDay !== undefined) entry.nglMbblPerDay = nglMbblPerDay;
      if (oilMbblPerDay !== undefined) entry.oilMbblPerDay = oilMbblPerDay;
    }
  }

  /** Custom commodity price wins per-field; otherwise falls back to the supplied current-market value. Replaces the old all-or-nothing commodityMode switch so overriding only one of the three prices (e.g. just natural gas) leaves NGL/oil on Default Forecast market pricing. */
  function resolveCommodityPriceField(custom: number | undefined, unit: string, label: string, live: SourcedValue | undefined): SourcedValue | undefined {
    return userSourced(custom, unit, `User-entered custom ${label} price override.`) ?? live;
  }

  const currentMarketPrices: RrcCurrentMarketPrices = {
    henryHubPerMmbtu: resolveCommodityPriceField(request.customCommodity?.henryHubPerMmbtu, "$/MMBtu", "Henry Hub (natural gas)", request.liveCommodity?.henryHubPerMmbtu),
    wtiPerBbl: resolveCommodityPriceField(request.customCommodity?.wtiPerBbl, "$/bbl", "WTI (oil)", request.liveCommodity?.wtiPerBbl),
    nglPerBbl: resolveCommodityPriceField(request.customCommodity?.nglPerBbl, "$/bbl", "NGL realization", request.liveCommodity?.nglPerBbl)
  };

  const annualOverrides: RrcAnnualOverrides = {};
  for (const year of RRC_FORECAST_YEARS) {
    const costs = request.costs[year];
    const capex = request.capex[year];
    const pricing = request.pricing[year];
    const cashGaPerMcfeInput = costs?.cashGaPerMcfe;
    const cashGaMillion =
      typeof cashGaPerMcfeInput === "number" && Number.isFinite(cashGaPerMcfeInput)
        ? (() => {
            // cashGaMillion is a per-quarter $mm run-rate (rrc-complete.ts applies the same
            // SourcedValue flat across all 4 quarters of the year, exactly like loePerMcfe,
            // cashInterestMillion, and explorationMillion), so the annual dollar figure
            // implied by the entered $/Mcfe rate is divided by 4 here -- using this year's
            // exact forecast-reconciled annual production (same volume Revenue uses; no
            // separate 365-day approximation), not an average-quarter estimate.
            const annualMcfe = annualMcfeForYear(year, productionOverrides);
            if (annualMcfe === null) return undefined;
            const annualGaMillion = (annualMcfe * cashGaPerMcfeInput) / 1000;
            return userSourced(
              annualGaMillion / 4,
              "$mm",
              `User-entered $${cashGaPerMcfeInput}/Mcfe G&A assumption implies $${annualGaMillion.toFixed(1)}mm annually using this year's forecast-reconciled annual production (${annualMcfe.toFixed(1)} MMcfe, the same volume this run uses for Revenue), applied as a flat $${(annualGaMillion / 4).toFixed(1)}mm/quarter run-rate.`
            );
          })()
        : undefined;
    const entry: RrcAnnualOverride = {
      loePerMcfe: userSourced(costs?.loePerMcfe, "$/Mcfe", "User-entered LOE assumption."),
      gatheringTransportPerMcfe: userSourced(costs?.gatheringTransportPerMcfe, "$/Mcfe", "User-entered gathering/transport/processing assumption."),
      cashGaMillion,
      explorationMillion: userSourced(costs?.explorationMillion, "$mm", "User-entered exploration expense assumption."),
      cashInterestMillion: userSourced(costs?.cashInterestMillion, "$mm", "User-entered cash interest assumption."),
      cashTaxRate: userSourced(costs?.cashTaxRate, "decimal", "User-entered cash tax rate assumption."),
      // 2026 always reconciles H1 actual CapEx against the full-year target (guided, or the
      // user's annual override) to derive the required H2 total, evenly split Q3/Q4 -- see
      // resolveRrc2026CapexOverride. 2027/2028 have no actual/estimate split, so a user
      // override there is a plain flat annual figure, unchanged from before.
      capexTotalMillion: year === "2026" ? resolveRrc2026CapexOverride(capex?.totalMillion) : userSourced(capex?.totalMillion, "$mm", "User-entered annual capex assumption."),
      gasBasisPerMcf: userSourced(pricing?.gasBasisPerMcf, "$/Mcf", "User-entered gas differential vs. NYMEX assumption (realized gas price = Henry Hub + this value)."),
      oilDifferentialPerBbl: userSourced(pricing?.oilDifferentialPerBbl, "$/bbl", "User-entered oil differential vs. WTI assumption (realized oil price = WTI + this value).")
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

function annualSummary(
  year: RrcForecastYear,
  periods: ForecastPeriodResult[],
  forwardYear: RrcForecastYear,
  forwardYearFcf: number | null,
  forwardYearEquityValue: number | null,
  endingNetDebtMillion: number | null
): RrcAnnualPeriodSummary {
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
    fcfYield,
    endingNetDebtMillion
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
  // The TRUE forecast ending net debt/net cash, exactly as the balance-sheet roll-forward
  // produced it -- always shown to the user, never floored, never suppressed.
  const forecastEndingNetDebtMillion = balanceSheetAtForwardYearEnd?.netDebtMillion ?? null;
  // Valuation net debt: floored at $0 for the PRIMARY EV/EBITDAX bridge only, because this
  // model does not simulate buybacks, special dividends, acquisitions, or other capital
  // allocation of unmodeled excess free cash flow -- once forecast net debt reaches zero,
  // hypothetical accumulated cash beyond that is not credited to implied equity value. An
  // explicit user override bypasses the floor entirely (it is not "unmodeled" cash; it is a
  // deliberate input). FCF, the balance-sheet roll-forward, and forecastEndingNetDebtMillion
  // above are all completely unaffected by this convention.
  const userNetDebtOverride = request.valuation.netDebtMillionOverride;
  const netDebtMillion =
    userNetDebtOverride !== undefined
      ? userNetDebtOverride
      : forecastEndingNetDebtMillion === null
        ? null
        : Math.max(0, forecastEndingNetDebtMillion);
  const valuationNetDebtFloorApplied =
    userNetDebtOverride === undefined && forecastEndingNetDebtMillion !== null && forecastEndingNetDebtMillion < 0;
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
    forecastEndingNetDebtMillion,
    valuationNetDebtFloorApplied,
    netDebtPeriod,
    ebitdaxPeriod: `${forwardYear} (Q1-Q4)`,
    dilutedSharesMillion
  };

  const forwardYearFcf = sumQuarterly(periodsByYear(forwardYear), (p) => p.freeCashFlowMillion);

  const annual = Object.fromEntries(
    RRC_FORECAST_YEARS.map((year) => {
      const yearEndingNetDebt = balanceSheet.find((b) => b.period === `${year}Q4`)?.netDebtMillion ?? null;
      return [year, annualSummary(year, periodsByYear(year), forwardYear, forwardYearFcf, multiple.equityValueMillion, yearEndingNetDebt)];
    })
  ) as Record<RrcForecastYear, RrcAnnualPeriodSummary>;

  // Secondary/advanced DCF only. Fixes the same class of valuation-date bug: the prior
  // implementation subtracted the *ending* (2028) net debt from a value derived by
  // discounting future cash flows back to today, double counting the FCF-funded debt
  // paydown those cash flows already represent. This uses the latest reported (Q2 2026)
  // net debt instead, the correct DCF convention.
  // Known simplification: 2026's annual FCF now includes Q1+Q2 actual (already realized)
  // alongside Q3+Q4 estimated cash flow, but is still discounted as a single "year 1" future
  // cash flow -- this slightly overstates the discount applied to the already-realized H1
  // portion. DCF remains a secondary output; EV/EBITDAX (above) is unaffected and primary.
  const dcf = calculateDcf({
    annualFreeCashFlowMillion: RRC_FORECAST_YEARS.map((year, index) => ({ year: 2026 + index, value: annual[year].freeCashFlowMillion })),
    discountRate: DEFAULT_DCF_DISCOUNT_RATE,
    terminalGrowthRate: DEFAULT_DCF_TERMINAL_GROWTH_RATE,
    netDebtMillion: rrcActualQuarters["2026Q2"].netDebtMillion,
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
      "Valuation net debt is floored at $0; unallocated forecast excess cash is not credited to implied equity value. This model does not simulate buybacks, special dividends, acquisitions, or other capital allocation of unmodeled excess free cash flow, so the primary EV/EBITDAX bridge stops crediting equity value for hypothetical accumulated cash once forecast net debt reaches zero. The forecast's true ending net debt/net cash figure is unaffected and always reported separately (forecastEndingNetDebtMillion).",
      "The secondary DCF output uses today's reported net debt, not a future ending net debt, to avoid double-counting FCF-funded debt paydown."
    ]
  };
}

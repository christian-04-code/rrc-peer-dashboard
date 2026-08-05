/**
 * Deterministic quarterly production build.
 *
 * Replaces straight-line annual interpolation with an auditable roll-forward:
 * each quarter's exit and average rate is derived from the prior quarter's
 * exit rate, an explicit base-decline assumption, and explicit new-well
 * (TIL) activity -- never from re-interpolating a year-end target.
 *
 * This module contains no company-specific numbers. It is a general engine;
 * callers supply beginning production, decline, activity, and mix as
 * SourcedValue-backed assumptions. Any assumption left unavailable (value:
 * null) flows through as null with a warning -- it is never defaulted to
 * zero or silently estimated.
 *
 * Unit convention matches lib/forecast/calculations.ts: gas is MMcf/d, NGL
 * and oil are Mbbl/d, and "Mcfe" fields are actually on the MMcfe scale
 * (1 Mbbl x 6 Mcf/bbl = 6 MMcf-equivalent) -- consistent with the existing
 * totalMcfe = gasMmcf + (nglMbbl + oilMbbl) * 6 formula.
 */

import type { AssumptionSource, ProductionAssumptions, SourcedValue } from "@/lib/forecast/types";

export type ProductionTimingConvention = "quarter-start" | "mid-quarter" | "quarter-end";

export type ProductionBeginningState = {
  period: string;
  gasMmcfPerDay: SourcedValue;
  nglMbblPerDay: SourcedValue;
  oilMbblPerDay: SourcedValue;
};

export type BaseDeclineAssumption = {
  /** Effective annual decline rate applied to trailing base production, as a decimal (0.12 = 12%/yr). */
  annualEffectiveDeclineRate: SourcedValue;
};

export type NewWellActivityAssumption = {
  period: string;
  /** Wells turned in line during the quarter. Must not be inferred from wells drilled or completed. */
  tilCount: SourcedValue;
  /** Initial daily rate contributed per TIL at the moment of turn-in-line, MMcfe/d. */
  productivityPerTilMcfePerDay: SourcedValue;
  timing: ProductionTimingConvention;
};

export type CommodityMixAssumption = {
  period: string;
  gasPctOfMcfe: SourcedValue;
  nglPctOfMcfe: SourcedValue;
  oilPctOfMcfe: SourcedValue;
};

export type ProductionBuildAssumptions = {
  beginning: ProductionBeginningState;
  decline: BaseDeclineAssumption;
  activity: NewWellActivityAssumption[];
  mix: CommodityMixAssumption[];
  /** Optional supported ceiling on total exit-rate production, MMcfe/d. Omit when no such limit is supported. */
  capacityMcfePerDayLimit?: SourcedValue;
};

export type ProductionRatePerDay = {
  gasMmcfPerDay: number | null;
  nglMbblPerDay: number | null;
  oilMbblPerDay: number | null;
  totalMcfePerDay: number | null;
};

export type QuarterlyProductionBuild = {
  period: string;
  days: number;
  timing: ProductionTimingConvention | "reported";
  exitRatePerDay: ProductionRatePerDay;
  averageRatePerDay: ProductionRatePerDay;
  volumes: {
    gasMmcf: number | null;
    nglMbbl: number | null;
    oilMbbl: number | null;
    totalMcfe: number | null;
  };
  newWellContributionMcfePerDay: number | null;
  baseDeclineAppliedRate: number | null;
  sources: AssumptionSource[];
  warnings: string[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numeric(input: SourcedValue, label: string, period: string, warnings: string[]): number | null {
  if (input.value === null || !isFiniteNumber(input.value)) {
    warnings.push(`${label} is unavailable for ${period}.`);
    return null;
  }
  return input.value;
}

function nonNegative(value: number | null, label: string, period: string, warnings: string[]): number | null {
  if (value === null) return null;
  if (value < 0) {
    warnings.push(`${label} for ${period} is negative (${value}); rejected rather than clamped.`);
    return null;
  }
  return value;
}

function totalFromMcfe(gasMmcfPerDay: number | null, nglMbblPerDay: number | null, oilMbblPerDay: number | null): number | null {
  if (gasMmcfPerDay === null || nglMbblPerDay === null || oilMbblPerDay === null) return null;
  return gasMmcfPerDay + (nglMbblPerDay + oilMbblPerDay) * 6;
}

function rate(gas: number | null, ngl: number | null, oil: number | null): ProductionRatePerDay {
  return { gasMmcfPerDay: gas, nglMbblPerDay: ngl, oilMbblPerDay: oil, totalMcfePerDay: totalFromMcfe(gas, ngl, oil) };
}

const EPSILON = 1e-6;

function splitByMix(
  totalMcfePerDay: number | null,
  mix: CommodityMixAssumption | undefined,
  period: string,
  warnings: string[]
): ProductionRatePerDay {
  if (totalMcfePerDay === null) return rate(null, null, null);
  if (!mix) {
    warnings.push(`Commodity mix is unavailable for ${period}; total production is known but the gas/NGL/oil split is not.`);
    return { gasMmcfPerDay: null, nglMbblPerDay: null, oilMbblPerDay: null, totalMcfePerDay };
  }

  const gasPct = numeric(mix.gasPctOfMcfe, "Gas mix percentage", period, warnings);
  const nglPct = numeric(mix.nglPctOfMcfe, "NGL mix percentage", period, warnings);
  const oilPct = numeric(mix.oilPctOfMcfe, "Oil mix percentage", period, warnings);

  if (gasPct === null || nglPct === null || oilPct === null) {
    return { gasMmcfPerDay: null, nglMbblPerDay: null, oilMbblPerDay: null, totalMcfePerDay };
  }
  if ([gasPct, nglPct, oilPct].some((pct) => pct < 0 || pct > 1)) {
    warnings.push(`Commodity mix percentage for ${period} is outside 0-1.`);
    return { gasMmcfPerDay: null, nglMbblPerDay: null, oilMbblPerDay: null, totalMcfePerDay };
  }
  if (Math.abs(gasPct + nglPct + oilPct - 1) > 1e-4) {
    warnings.push(`Commodity mix for ${period} does not reconcile to total production (sums to ${(gasPct + nglPct + oilPct).toFixed(6)}, expected 1).`);
    return { gasMmcfPerDay: null, nglMbblPerDay: null, oilMbblPerDay: null, totalMcfePerDay };
  }

  const gasMmcfPerDay = totalMcfePerDay * gasPct;
  const nglMbblPerDay = (totalMcfePerDay * nglPct) / 6;
  const oilMbblPerDay = (totalMcfePerDay * oilPct) / 6;
  const reconciled = totalFromMcfe(gasMmcfPerDay, nglMbblPerDay, oilMbblPerDay);
  if (reconciled === null || Math.abs(reconciled - totalMcfePerDay) > EPSILON * Math.max(1, Math.abs(totalMcfePerDay))) {
    warnings.push(`Commodity components for ${period} failed to reconcile to total production.`);
    return { gasMmcfPerDay: null, nglMbblPerDay: null, oilMbblPerDay: null, totalMcfePerDay };
  }

  return { gasMmcfPerDay, nglMbblPerDay, oilMbblPerDay, totalMcfePerDay };
}

/**
 * Builds one deterministic quarterly production record per requested period.
 * `periods[0].period` must equal `assumptions.beginning.period` -- that first
 * record simply preserves the reported baseline. Every later period rolls
 * forward from the prior period's exit rate via explicit decline and TIL
 * activity.
 */
export function buildQuarterlyProduction(
  periods: Array<{ period: string; days: number }>,
  assumptions: ProductionBuildAssumptions
): QuarterlyProductionBuild[] {
  if (periods.length === 0) {
    throw new Error("buildQuarterlyProduction requires at least one period.");
  }
  if (periods[0].period !== assumptions.beginning.period) {
    throw new Error(
      `The first requested period (${periods[0].period}) must equal the beginning production period (${assumptions.beginning.period}).`
    );
  }

  const results: QuarterlyProductionBuild[] = [];
  let priorExitTotal: number | null = null;

  for (let i = 0; i < periods.length; i++) {
    const { period, days } = periods[i];
    const warnings: string[] = [];

    if (!Number.isInteger(days) || days < 1 || days > 92) {
      warnings.push(`Invalid day count for ${period}.`);
      results.push({
        period,
        days,
        timing: "reported",
        exitRatePerDay: rate(null, null, null),
        averageRatePerDay: rate(null, null, null),
        volumes: { gasMmcf: null, nglMbbl: null, oilMbbl: null, totalMcfe: null },
        newWellContributionMcfePerDay: null,
        baseDeclineAppliedRate: null,
        sources: [],
        warnings
      });
      priorExitTotal = null;
      continue;
    }

    if (i === 0) {
      const gas = nonNegative(numeric(assumptions.beginning.gasMmcfPerDay, "Beginning gas production", period, warnings), "Beginning gas production", period, warnings);
      const ngl = nonNegative(numeric(assumptions.beginning.nglMbblPerDay, "Beginning NGL production", period, warnings), "Beginning NGL production", period, warnings);
      const oil = nonNegative(numeric(assumptions.beginning.oilMbblPerDay, "Beginning oil production", period, warnings), "Beginning oil production", period, warnings);
      const averageRatePerDay = rate(gas, ngl, oil);
      const volumes = {
        gasMmcf: gas === null ? null : gas * days,
        nglMbbl: ngl === null ? null : ngl * days,
        oilMbbl: oil === null ? null : oil * days,
        totalMcfe: null as number | null
      };
      volumes.totalMcfe = totalFromMcfe(volumes.gasMmcf, volumes.nglMbbl, volumes.oilMbbl);

      results.push({
        period,
        days,
        timing: "reported",
        exitRatePerDay: averageRatePerDay,
        averageRatePerDay,
        volumes,
        newWellContributionMcfePerDay: null,
        baseDeclineAppliedRate: null,
        sources: [
          assumptions.beginning.gasMmcfPerDay.source,
          assumptions.beginning.nglMbblPerDay.source,
          assumptions.beginning.oilMbblPerDay.source
        ],
        warnings
      });
      priorExitTotal = averageRatePerDay.totalMcfePerDay;
      continue;
    }

    const sources: AssumptionSource[] = [];
    const baseBegin = priorExitTotal;
    if (baseBegin === null) {
      warnings.push(`${period} has no valid prior-quarter exit rate to decline from.`);
    }

    const annualDecline = numeric(assumptions.decline.annualEffectiveDeclineRate, "Base decline rate", period, warnings);
    let quarterlyDeclineRate: number | null = null;
    if (annualDecline !== null) {
      if (annualDecline < 0 || annualDecline > 0.95) {
        warnings.push(`Base decline rate ${annualDecline} for ${period} is outside the supported 0-95% annual range.`);
      } else {
        quarterlyDeclineRate = 1 - Math.pow(1 - annualDecline, 0.25);
        sources.push(assumptions.decline.annualEffectiveDeclineRate.source);
      }
    }

    const baseEnd =
      baseBegin === null || quarterlyDeclineRate === null || !isFiniteNumber(quarterlyDeclineRate)
        ? null
        : baseBegin * (1 - quarterlyDeclineRate);

    const activity = assumptions.activity.find((a) => a.period === period);
    let newWellAdd: number | null = null;
    let timing: ProductionTimingConvention | "reported" = "reported";
    if (!activity) {
      warnings.push(`No TIL activity assumption was provided for ${period}.`);
    } else {
      timing = activity.timing;
      const tilCount = nonNegative(numeric(activity.tilCount, "TIL count", period, warnings), "TIL count", period, warnings);
      const productivity = nonNegative(
        numeric(activity.productivityPerTilMcfePerDay, "New-well productivity per TIL", period, warnings),
        "New-well productivity per TIL",
        period,
        warnings
      );
      if (tilCount === 0) {
        newWellAdd = 0;
        sources.push(activity.tilCount.source);
      } else if (tilCount !== null && productivity === null) {
        warnings.push(`${period} reports ${tilCount} TIL(s) but has no supported productivity input; new production withheld.`);
      } else if (tilCount !== null && productivity !== null) {
        newWellAdd = tilCount * productivity;
        sources.push(activity.tilCount.source, activity.productivityPerTilMcfePerDay.source);
      }
    }

    const capacityLimit = assumptions.capacityMcfePerDayLimit
      ? numeric(assumptions.capacityMcfePerDayLimit, "Production capacity limit", period, warnings)
      : null;

    const exitTotal = baseEnd === null || newWellAdd === null ? null : baseEnd + newWellAdd;
    if (exitTotal !== null && capacityLimit !== null && exitTotal > capacityLimit) {
      warnings.push(`Exit rate for ${period} (${exitTotal.toFixed(3)} MMcfe/d) exceeds the supported capacity limit (${capacityLimit} MMcfe/d).`);
    }

    let newWellAvgContribution: number | null = newWellAdd;
    if (newWellAdd !== null) {
      if (timing === "mid-quarter") newWellAvgContribution = newWellAdd * 0.5;
      else if (timing === "quarter-end") newWellAvgContribution = 0;
    }
    const baseAvg = baseBegin === null || baseEnd === null ? null : (baseBegin + baseEnd) / 2;
    const averageTotal = baseAvg === null || newWellAvgContribution === null ? null : baseAvg + newWellAvgContribution;

    const mixForPeriod = assumptions.mix.find((m) => m.period === period);
    const exitRatePerDay = splitByMix(exitTotal, mixForPeriod, period, warnings);
    const averageRatePerDay = splitByMix(averageTotal, mixForPeriod, period, warnings);

    const volumes = {
      gasMmcf: averageRatePerDay.gasMmcfPerDay === null ? null : averageRatePerDay.gasMmcfPerDay * days,
      nglMbbl: averageRatePerDay.nglMbblPerDay === null ? null : averageRatePerDay.nglMbblPerDay * days,
      oilMbbl: averageRatePerDay.oilMbblPerDay === null ? null : averageRatePerDay.oilMbblPerDay * days,
      totalMcfe: null as number | null
    };
    volumes.totalMcfe = totalFromMcfe(volumes.gasMmcf, volumes.nglMbbl, volumes.oilMbbl);

    results.push({
      period,
      days,
      timing,
      exitRatePerDay,
      averageRatePerDay,
      volumes,
      newWellContributionMcfePerDay: newWellAdd,
      baseDeclineAppliedRate: quarterlyDeclineRate,
      sources,
      warnings
    });

    priorExitTotal = exitRatePerDay.totalMcfePerDay;
  }

  return results;
}

/** Converts one quarter's average daily rate into the SourcedValue triplet the existing forecast pipeline expects. */
export function toProductionAssumptions(build: QuarterlyProductionBuild, unavailableNote: string): ProductionAssumptions {
  const source: AssumptionSource = build.sources[0] ?? {
    name: "RRC Peer Dashboard production engine",
    period: build.period,
    retrievedAt: new Date(0).toISOString(),
    classification: "modeled",
    notes: unavailableNote
  };

  return {
    gasMmcfPerDay: { value: build.averageRatePerDay.gasMmcfPerDay, unit: "MMcf/d", source },
    nglMbblPerDay: { value: build.averageRatePerDay.nglMbblPerDay, unit: "Mbbl/d", source },
    oilMbblPerDay: { value: build.averageRatePerDay.oilMbblPerDay, unit: "Mbbl/d", source }
  };
}

export type ProductionScenarioAdjustment = {
  declineRateAbsoluteDelta?: number;
  productivityMultiplier?: number;
  tilCountMultiplier?: number;
};

/** Returns a new assumptions object with the adjustment applied; never mutates the input. */
export function applyProductionScenarioAdjustment(
  assumptions: ProductionBuildAssumptions,
  adjustment: ProductionScenarioAdjustment
): ProductionBuildAssumptions {
  const decline: BaseDeclineAssumption = {
    annualEffectiveDeclineRate: {
      ...assumptions.decline.annualEffectiveDeclineRate,
      value:
        assumptions.decline.annualEffectiveDeclineRate.value === null || adjustment.declineRateAbsoluteDelta === undefined
          ? assumptions.decline.annualEffectiveDeclineRate.value
          : assumptions.decline.annualEffectiveDeclineRate.value + adjustment.declineRateAbsoluteDelta
    }
  };

  const activity = assumptions.activity.map((a) => ({
    ...a,
    tilCount: {
      ...a.tilCount,
      value:
        a.tilCount.value === null || adjustment.tilCountMultiplier === undefined
          ? a.tilCount.value
          : a.tilCount.value * adjustment.tilCountMultiplier
    },
    productivityPerTilMcfePerDay: {
      ...a.productivityPerTilMcfePerDay,
      value:
        a.productivityPerTilMcfePerDay.value === null || adjustment.productivityMultiplier === undefined
          ? a.productivityPerTilMcfePerDay.value
          : a.productivityPerTilMcfePerDay.value * adjustment.productivityMultiplier
    }
  }));

  return {
    beginning: assumptions.beginning,
    decline,
    activity,
    mix: assumptions.mix,
    capacityMcfePerDayLimit: assumptions.capacityMcfePerDayLimit
  };
}

/** Sums exactly 4 quarters of volumes into an annual total; null (with a warning) if the set is incomplete or any quarter is null. */
export function summarizeAnnualProduction(quarters: QuarterlyProductionBuild[]): {
  gasMmcf: number | null;
  nglMbbl: number | null;
  oilMbbl: number | null;
  totalMcfe: number | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (quarters.length !== 4) {
    warnings.push(`Annual production requires exactly 4 quarters; received ${quarters.length}.`);
    return { gasMmcf: null, nglMbbl: null, oilMbbl: null, totalMcfe: null, warnings };
  }

  function sum(key: "gasMmcf" | "nglMbbl" | "oilMbbl" | "totalMcfe"): number | null {
    if (quarters.some((q) => q.volumes[key] === null)) return null;
    return quarters.reduce((total, q) => total + (q.volumes[key] as number), 0);
  }

  const gasMmcf = sum("gasMmcf");
  const nglMbbl = sum("nglMbbl");
  const oilMbbl = sum("oilMbbl");
  const totalMcfe = sum("totalMcfe");
  const reconciledTotal = totalFromMcfe(gasMmcf, nglMbbl, oilMbbl);
  if (totalMcfe !== null && reconciledTotal !== null && Math.abs(totalMcfe - reconciledTotal) > EPSILON * Math.max(1, Math.abs(totalMcfe))) {
    warnings.push("Annual total production does not reconcile with the sum of its quarterly components.");
    return { gasMmcf, nglMbbl, oilMbbl, totalMcfe: null, warnings };
  }

  return { gasMmcf, nglMbbl, oilMbbl, totalMcfe, warnings };
}

/**
 * Deterministic flat production forecast.
 *
 * The default forecast holds the latest reported quarterly production
 * baseline constant across future periods -- no decline curve, no TIL
 * activity, no type curve, no annual guidance ramp. A caller may override
 * specific periods with explicit user-entered production; anything not
 * overridden falls back to the reported baseline. Missing or invalid values
 * flow through as null with a warning -- never defaulted to zero, never
 * estimated.
 *
 * This module contains no company-specific numbers. Unit convention matches
 * lib/forecast/calculations.ts: gas is MMcf/d, NGL and oil are Mbbl/d, and
 * "Mcfe" fields are on the MMcfe scale (1 Mbbl x 6 Mcf/bbl = 6
 * MMcf-equivalent), consistent with totalMcfe = gasMmcf + (nglMbbl + oilMbbl) * 6.
 */

import type { AssumptionSource, ProductionAssumptions, ProductionResult, SourcedValue } from "@/lib/forecast/types";

export type ProductionBeginningState = {
  period: string;
  gasMmcfPerDay: SourcedValue;
  nglMbblPerDay: SourcedValue;
  oilMbblPerDay: SourcedValue;
};

export type ProductionRatePerDay = {
  gasMmcfPerDay: number | null;
  nglMbblPerDay: number | null;
  oilMbblPerDay: number | null;
  totalMcfePerDay: number | null;
};

export type ProductionSourceClassification = "reported" | "override";

/** Describes who/what supplied an override, when it isn't a raw user entry (e.g. a management-guidance-derived default). Omitting this preserves the original behavior: every override is attributed to the end user. */
export type ProductionOverrideAttribution = {
  classification: Exclude<AssumptionSource["classification"], "reported">;
  sourceName: string;
  sourceReference?: string;
  notePrefix: string;
};

/** A production value for one future period, from the user or from a resolved default (e.g. a management-guidance target). Omit a field to leave it at the reported baseline; pass null to explicitly clear it. */
export type ProductionOverrideInput = {
  period: string;
  gasMmcfPerDay?: number | null;
  nglMbblPerDay?: number | null;
  oilMbblPerDay?: number | null;
  /** Defaults to { classification: "user", sourceName: "User production assumption", notePrefix: "User production assumption. Not company guidance; a local scenario override." } */
  attribution?: ProductionOverrideAttribution;
};

export type FlatProductionPeriodResult = {
  period: string;
  days: number;
  sourceClassification: ProductionSourceClassification;
  overriddenFields: Array<"gas" | "ngl" | "oil">;
  ratePerDay: ProductionRatePerDay;
  volumes: ProductionResult;
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

const DEFAULT_ATTRIBUTION: ProductionOverrideAttribution = {
  classification: "user",
  sourceName: "User production assumption",
  notePrefix: "User production assumption. Not company guidance; a local scenario override."
};

function overrideSource(period: string, notes: string, attribution: ProductionOverrideAttribution = DEFAULT_ATTRIBUTION): AssumptionSource {
  return {
    name: attribution.sourceName,
    reference: attribution.sourceReference,
    period,
    retrievedAt: new Date(0).toISOString(),
    classification: attribution.classification,
    notes: `${attribution.notePrefix} ${notes}`.trim()
  };
}

function reportedSource(base: AssumptionSource): AssumptionSource {
  return { ...base, notes: `Latest reported production held constant. ${base.notes ?? ""}`.trim() };
}

type FieldLabel = "gas" | "ngl" | "oil";

function resolveField(
  label: FieldLabel,
  displayLabel: string,
  reportedValue: number | null,
  reportedSourceValue: AssumptionSource,
  overrideRaw: number | null | undefined,
  period: string,
  warnings: string[],
  attribution?: ProductionOverrideAttribution
): { value: number | null; source: AssumptionSource; overridden: boolean } {
  if (overrideRaw === undefined) {
    return { value: reportedValue, source: reportedSource(reportedSourceValue), overridden: false };
  }
  if (overrideRaw === null) {
    warnings.push(`${displayLabel} for ${period} was explicitly cleared by a user override.`);
    return { value: null, source: overrideSource(period, `${displayLabel} explicitly cleared.`, attribution), overridden: true };
  }
  if (!isFiniteNumber(overrideRaw)) {
    warnings.push(`${displayLabel} override for ${period} is not a finite number; rejected.`);
    return { value: null, source: overrideSource(period, `${displayLabel} override rejected: not finite.`, attribution), overridden: true };
  }
  if (overrideRaw < 0) {
    warnings.push(`${displayLabel} override for ${period} is negative (${overrideRaw}); rejected rather than clamped.`);
    return { value: null, source: overrideSource(period, `${displayLabel} override rejected: negative.`, attribution), overridden: true };
  }
  return { value: overrideRaw, source: overrideSource(period, `${displayLabel} set to ${overrideRaw}.`, attribution), overridden: true };
}

/**
 * Builds one production record per requested period. Every period defaults to
 * `latestReported`; a period is only changed by a matching entry in
 * `overrides`, and only for the fields that entry sets. The `latestReported`
 * period itself is never overridden -- it is reported historical data.
 */
export function buildFlatProductionForecast(
  latestReported: ProductionBeginningState,
  periods: Array<{ period: string; days: number }>,
  overrides: ProductionOverrideInput[] = []
): FlatProductionPeriodResult[] {
  if (periods.length === 0) {
    throw new Error("buildFlatProductionForecast requires at least one period.");
  }

  return periods.map(({ period, days }) => {
    const warnings: string[] = [];

    if (!Number.isInteger(days) || days < 1 || days > 92) {
      warnings.push(`Invalid day count for ${period}.`);
      return {
        period,
        days,
        sourceClassification: "reported" as const,
        overriddenFields: [],
        ratePerDay: rate(null, null, null),
        volumes: { gasMmcf: null, nglMbbl: null, oilMbbl: null, totalMcfe: null },
        sources: [],
        warnings
      };
    }

    const reportedGas = nonNegative(numeric(latestReported.gasMmcfPerDay, "Latest reported gas production", period, warnings), "Latest reported gas production", period, warnings);
    const reportedNgl = nonNegative(numeric(latestReported.nglMbblPerDay, "Latest reported NGL production", period, warnings), "Latest reported NGL production", period, warnings);
    const reportedOil = nonNegative(numeric(latestReported.oilMbblPerDay, "Latest reported oil production", period, warnings), "Latest reported oil production", period, warnings);

    const isReportedPeriod = period === latestReported.period;
    let override = overrides.find((o) => o.period === period);
    if (override && isReportedPeriod) {
      warnings.push(`Override for ${period} was ignored: this is the reported historical period and cannot be overwritten.`);
      override = undefined;
    }

    const gas = resolveField("gas", "Gas production", reportedGas, latestReported.gasMmcfPerDay.source, override?.gasMmcfPerDay, period, warnings, override?.attribution);
    const ngl = resolveField("ngl", "NGL production", reportedNgl, latestReported.nglMbblPerDay.source, override?.nglMbblPerDay, period, warnings, override?.attribution);
    const oil = resolveField("oil", "Oil production", reportedOil, latestReported.oilMbblPerDay.source, override?.oilMbblPerDay, period, warnings, override?.attribution);

    const overriddenFields = ([
      ["gas", gas.overridden],
      ["ngl", ngl.overridden],
      ["oil", oil.overridden]
    ] as const)
      .filter(([, overridden]) => overridden)
      .map(([label]) => label);

    const ratePerDay = rate(gas.value, ngl.value, oil.value);
    const volumes: ProductionResult = {
      gasMmcf: ratePerDay.gasMmcfPerDay === null ? null : ratePerDay.gasMmcfPerDay * days,
      nglMbbl: ratePerDay.nglMbblPerDay === null ? null : ratePerDay.nglMbblPerDay * days,
      oilMbbl: ratePerDay.oilMbblPerDay === null ? null : ratePerDay.oilMbblPerDay * days,
      totalMcfe: null
    };
    volumes.totalMcfe = totalFromMcfe(volumes.gasMmcf, volumes.nglMbbl, volumes.oilMbbl);

    return {
      period,
      days,
      sourceClassification: overriddenFields.length > 0 ? "override" : "reported",
      overriddenFields,
      ratePerDay,
      volumes,
      sources: [gas.source, ngl.source, oil.source],
      warnings
    };
  });
}

/** Converts one period's daily rate into the SourcedValue triplet the existing forecast pipeline expects. */
export function toProductionAssumptions(period: FlatProductionPeriodResult): ProductionAssumptions {
  const [gasSource, nglSource, oilSource] = period.sources;
  return {
    gasMmcfPerDay: { value: period.ratePerDay.gasMmcfPerDay, unit: "MMcf/d", source: gasSource },
    nglMbblPerDay: { value: period.ratePerDay.nglMbblPerDay, unit: "Mbbl/d", source: nglSource },
    oilMbblPerDay: { value: period.ratePerDay.oilMbblPerDay, unit: "Mbbl/d", source: oilSource }
  };
}

/** Sums exactly 4 periods of volumes into an annual total; null (with a warning) if the set is incomplete or any period is null. */
export function summarizeAnnualProduction(periods: Array<{ volumes: ProductionResult }>): {
  gasMmcf: number | null;
  nglMbbl: number | null;
  oilMbbl: number | null;
  totalMcfe: number | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (periods.length !== 4) {
    warnings.push(`Annual production requires exactly 4 periods; received ${periods.length}.`);
    return { gasMmcf: null, nglMbbl: null, oilMbbl: null, totalMcfe: null, warnings };
  }

  function sum(key: "gasMmcf" | "nglMbbl" | "oilMbbl" | "totalMcfe"): number | null {
    if (periods.some((p) => p.volumes[key] === null)) return null;
    return periods.reduce((total, p) => total + (p.volumes[key] as number), 0);
  }

  const gasMmcf = sum("gasMmcf");
  const nglMbbl = sum("nglMbbl");
  const oilMbbl = sum("oilMbbl");
  const totalMcfe = sum("totalMcfe");
  const reconciledTotal = totalFromMcfe(gasMmcf, nglMbbl, oilMbbl);
  if (totalMcfe !== null && reconciledTotal !== null && Math.abs(totalMcfe - reconciledTotal) > 1e-6 * Math.max(1, Math.abs(totalMcfe))) {
    warnings.push("Annual total production does not reconcile with the sum of its period components.");
    return { gasMmcf, nglMbbl, oilMbbl, totalMcfe: null, warnings };
  }

  return { gasMmcf, nglMbbl, oilMbbl, totalMcfe, warnings };
}

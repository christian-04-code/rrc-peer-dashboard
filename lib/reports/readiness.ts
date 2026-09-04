/**
 * Publication-readiness contract (Phase 7A decision #6). This file is a
 * pure evaluator over caller-supplied booleans -- it never fetches data
 * itself and never decides what the real value of any input is. Phase 7B's
 * snapshot builder is what will actually check each real input (does a
 * current-week EIA storage observation exist, did the risk engine produce
 * output, etc.) and pass the result in here; inventing that fetch logic now
 * would be exactly the kind of "placeholder function that pretends to
 * generate data" Phase 7A is scoped to avoid.
 *
 * Required inputs are intentionally narrow (Phase 7A decision #6: "do not
 * invent required fields that existing data cannot reliably supply") --
 * every entry below is something this repo already computes today
 * (lib/eia/macro-fundamentals.ts's weekly storage fetch, Macro's
 * fundamentals snapshot, lib/market/macro-risk-engine.ts's deterministic
 * output, and the freshness/manifest metadata every one of those already
 * carries per-datapoint). Optional inputs degrade gracefully and never
 * block publication.
 */

export const REQUIRED_WEEKLY_REPORT_INPUTS = [
  /** The current reporting week's EIA Weekly Natural Gas Storage observation -- the report's own identity basis (Phase 7A decision #1); without it there is no week to report on. */
  "eiaWeeklyStorageObservation",
  /** Macro's existing fundamentals snapshot (Henry Hub, supply, demand, LNG -- lib/market/macro-fundamentals.ts) -- the deterministic backbone the report narrates over. */
  "macroFundamentalsSnapshot",
  /** The deterministic Range Macro risk engine's ranked output (lib/market/macro-risk-engine.ts) -- required so "biggest risk"/"biggest opportunity" are never AI-invented. */
  "rangeMacroRiskEngineOutput",
  /** A valid source/freshness manifest covering every included input -- required so the report's own "Sources / Data Freshness" section (Phase 7A decision #8) is never fabricated. */
  "sourceFreshnessManifest"
] as const;
export type RequiredWeeklyReportInputKey = (typeof REQUIRED_WEEKLY_REPORT_INPUTS)[number];

export const OPTIONAL_WEEKLY_REPORT_INPUTS = [
  "peerComparisons",
  "companyChanges",
  "news",
  "steoRevisionHistory",
  "otherForecastScenarios"
] as const;
export type OptionalWeeklyReportInputKey = (typeof OPTIONAL_WEEKLY_REPORT_INPUTS)[number];

export type ReadinessInputs = Record<RequiredWeeklyReportInputKey, boolean> &
  Partial<Record<OptionalWeeklyReportInputKey, boolean>>;

export type ReadinessResult = {
  ready: boolean;
  missingRequired: RequiredWeeklyReportInputKey[];
  /** Optional inputs that are false/absent -- never blocks `ready`, only surfaced so the report's own sources/freshness disclosure and the evidence-module selection (Phase 7B) know what to omit. */
  degradedOptional: OptionalWeeklyReportInputKey[];
};

/** `ready` is true iff every REQUIRED_WEEKLY_REPORT_INPUTS entry is true. Optional inputs never affect `ready`. */
export function evaluateReadiness(inputs: ReadinessInputs): ReadinessResult {
  const missingRequired = REQUIRED_WEEKLY_REPORT_INPUTS.filter((key) => !inputs[key]);
  const degradedOptional = OPTIONAL_WEEKLY_REPORT_INPUTS.filter((key) => !inputs[key]);
  return { ready: missingRequired.length === 0, missingRequired, degradedOptional };
}

import { getCompanyForecast } from "@/lib/forecast/api";
import type { AnnualForecastResult } from "@/lib/forecast/scenarios/annual-shared";
import type { SourceManifestEntry, WeeklyEvidenceItem } from "@/lib/reports/weekly-report-types";

/**
 * Range's own current DEFAULT-scenario forecast summary (category
 * "forecast_scenarios"), Phase 7B decision on an intentionally narrow
 * scope. Inspected lib/forecast/ before writing this: `runForecastScenario`
 * / `runCompanyForecast` require caller-supplied assumptions (pricing,
 * production, capex, valuation inputs) -- there is no single canonical
 * "the current forecast" without picking a scenario, so this snapshot does
 * NOT attempt to represent the full interactive Scenario Workbench.
 * `getCompanyForecast(ticker)` (lib/forecast/api.ts -> the per-company
 * adapter's parameterless `getForecast()`) is the one exception: it returns
 * a real, deterministic, parameterless DEFAULT scenario (guidance/current-
 * market-driven), so it is safe to surface as a single fact.
 *
 * What is explicitly NOT done here, and why: `forecastRevision` comparisons
 * (Phase 7A's ComparisonPeriod) require a real *persisted* prior scenario
 * vintage to diff against -- this project has no such persistence (unlike
 * STEO's macro_steo_snapshots table). Inventing a substitute (e.g. diffing
 * against last week's frozen report row) would conflate "the model was
 * re-run" with "a real prior forecast state," which Phase 7B's brief
 * explicitly warns against. So `comparisons` is always `[]` here -- an
 * honest "unavailable," not a weak substitute -- documented as a known gap
 * in docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md for a future phase to close
 * by adding real scenario-state persistence.
 */

const TICKER = "RRC";

function moneyDisplay(value: number | null): string {
  return value === null ? "--" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}MM`;
}

export type ForecastCollection = {
  items: WeeklyEvidenceItem[];
  manifestEntries: SourceManifestEntry[];
  present: boolean;
};

export function collectForecastEvidence(): ForecastCollection {
  let forecast: ReturnType<typeof getCompanyForecast>;
  try {
    forecast = getCompanyForecast(TICKER);
  } catch {
    return { items: [], manifestEntries: [{ key: "forecast_scenarios", label: "RRC default-scenario forecast", period: null, freshness: "unavailable", included: false }], present: false };
  }

  // getForecastCompanyAdapter's generic defaults to TResult=unknown; RRC's
  // adapter (lib/forecast/companies/rrc.ts) is known at runtime to return
  // AnnualForecastResult -- asserted here rather than threading a generic
  // through getCompanyForecast(), which would require a wider Phase-7B-
  // unrelated change to lib/forecast/api.ts's own public signature.
  const result = forecast.result as AnnualForecastResult;
  const forwardYear = forecast.company.periods?.defaultForwardYear ?? null;
  const summary = forwardYear ? result.annual[forwardYear] : undefined;
  if (!summary) {
    return { items: [], manifestEntries: [{ key: "forecast_scenarios", label: "RRC default-scenario forecast", period: null, freshness: "unavailable", included: false }], present: false };
  }

  const items: WeeklyEvidenceItem[] = [
    {
      evidenceId: "forecast_scenarios:rrc:default_scenario_revenue",
      category: "forecast_scenarios",
      metricKey: "default_scenario_revenue",
      label: `RRC Default-Scenario Forecast Revenue (${forwardYear})`,
      currentValue: summary.revenueMillion,
      displayValue: moneyDisplay(summary.revenueMillion),
      unit: "$MM",
      period: forwardYear,
      asOfDate: null,
      sourceIds: ["forecast_scenarios"],
      freshness: "current",
      comparisons: [],
      rangeDrivers: ["gas_pricing"],
      materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
      metadata: { scenario: "default", note: "No persisted prior scenario vintage exists yet -- forecastRevision comparison is not computed (see this adapter's file header)." }
    },
    {
      evidenceId: "forecast_scenarios:rrc:default_scenario_fcf",
      category: "forecast_scenarios",
      metricKey: "default_scenario_fcf",
      label: `RRC Default-Scenario Forecast Free Cash Flow (${forwardYear})`,
      currentValue: summary.freeCashFlowMillion,
      displayValue: moneyDisplay(summary.freeCashFlowMillion),
      unit: "$MM",
      period: forwardYear,
      asOfDate: null,
      sourceIds: ["forecast_scenarios"],
      freshness: "current",
      comparisons: [],
      rangeDrivers: ["gas_pricing"],
      materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
      metadata: { scenario: "default", note: "No persisted prior scenario vintage exists yet -- forecastRevision comparison is not computed (see this adapter's file header)." }
    }
  ];

  const manifestEntries: SourceManifestEntry[] = [
    { key: "forecast_scenarios", label: "RRC default-scenario forecast model", period: forwardYear, freshness: "current", included: true }
  ];

  return { items, manifestEntries, present: true };
}

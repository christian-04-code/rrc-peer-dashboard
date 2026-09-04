import type { Pool } from "pg";
import { buildNormalizedMarketMetrics } from "@/lib/market/build-market-metrics";
import { fetchDemandTable, fetchStateMarketedProductionTable, fetchSteoTable } from "@/lib/eia/macro-fundamentals";
import { normalizeDemand, normalizeStateProduction } from "@/lib/market/macro-fundamentals";
import { normalizeSteoTable, computeForecastRevisions } from "@/lib/market/macro-steo";
import { buildAppalachiaProduction, calculateFreshness, filterToForecastHorizon, shiftMonth } from "@/lib/market/macro-analytics";
import {
  buildMacroRiskPayload,
  buildRangeMacroSignals,
  classifyForecastDirection,
  rankRangeMacroSignals,
  type ForecastDirection,
  type MacroRiskPayload,
  type RangeMacroSignal,
  type RangeMacroSignalInputs,
  type RangeMacroSignalKey
} from "@/lib/market/macro-risk-engine";
import { computeMacroSummaryFingerprint } from "@/lib/market/persistence/summary-repo";
import { refreshSteoSnapshots } from "@/lib/market/macro-steo-refresh";
import { getCurrentAndPreviousSteoSnapshot } from "@/lib/market/persistence/steo-repo";
import { EIA_STEO_SERIES } from "@/lib/eia/series";
import type { NormalizedMarketMetric } from "@/lib/market/types";
import type { DemandMetric } from "@/lib/market/macro-types";
import type { SteoNormalizedSeries, SteoSeriesKey } from "@/lib/market/macro-steo-types";
import { compareDailyWeekly, compareMonthlySeries, compareStorageWeekly, compareSteoVintage } from "@/lib/reports/comparisons";
import type { EvidenceModuleKey, SourceManifestEntry, WeeklyEvidenceItem } from "@/lib/reports/weekly-report-types";

/**
 * Macro evidence collection (Phase 7B). Deliberately re-implements the same
 * one-fetch-pass pattern lib/market/macro-risk-orchestrate.ts's
 * buildMacroRiskSnapshot() already uses (same 4 Promise.allSettled EIA
 * calls, same normalizers, same buildRangeMacroSignals/rankRangeMacroSignals/
 * buildMacroRiskPayload/computeMacroSummaryFingerprint reuse for the
 * required rangeMacroRiskEngineOutput input) rather than calling that
 * function directly, because this adapter also needs raw access to the
 * underlying NormalizedMarketMetric/DemandMetric/AppalachiaProductionSummary
 * objects to build full evidence items -- buildMacroRiskSnapshot() only
 * returns the already-summarized signals, not the raw series. Calling both
 * would double the number of live EIA requests for no benefit.
 */

const generatedAtNow = () => new Date().toISOString();

function freshTrendPct(metric: NormalizedMarketMetric | undefined, periods: number): number | null {
  if (!metric || metric.status !== "ok" || metric.freshness === "stale" || metric.freshness === "unavailable") return null;
  const latest = metric.history[0];
  const prior = metric.history[periods];
  if (!latest || !prior || prior.value === 0) return null;
  return ((latest.value - prior.value) / Math.abs(prior.value)) * 100;
}
function freshValue(metric: NormalizedMarketMetric | undefined): number | null {
  if (!metric || metric.status !== "ok" || metric.freshness === "stale" || metric.freshness === "unavailable") return null;
  return metric.value;
}
function monthlyYoyOf(history: { period: string; value: number }[]): number | null {
  const latest = history[0];
  if (!latest || !/^\d{4}-\d{2}$/.test(latest.period)) return null;
  const [year, month] = latest.period.split("-").map(Number);
  const target = `${year - 1}-${String(month).padStart(2, "0")}`;
  const prior = history.find((point) => point.period === target);
  if (!prior || prior.value === 0) return null;
  return ((latest.value - prior.value) / Math.abs(prior.value)) * 100;
}
function freshDemandYoy(metric: DemandMetric | undefined): number | null {
  if (!metric || metric.status !== "ok" || metric.freshness === "stale" || metric.freshness === "unavailable") return null;
  return monthlyYoyOf(metric.history);
}
function freshDemandValue(metric: DemandMetric | undefined): number | null {
  if (!metric || metric.status !== "ok" || metric.freshness === "stale" || metric.freshness === "unavailable") return null;
  return metric.history[0]?.value ?? null;
}

function moneyOrCountDisplay(value: number | null, unit: string, digits = 1): string {
  return value === null ? "--" : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value)} ${unit}`;
}

const DRIVER_TO_EVIDENCE_ID: Record<RangeMacroSignalKey, string> = {
  gas_pricing: "gas_pricing:henry_hub_spot",
  storage_levels: "storage:lower48",
  us_gas_supply: "us_gas_supply:dry_gas_production",
  appalachia_supply: "appalachia_supply:pa_wv_oh_marketed_production",
  lng_demand: "lng_demand:us_lng_exports",
  power_data_center_demand: "power_data_center_demand:electric_power_gas_demand",
  industrial_demand: "industrial_demand:industrial_gas_demand"
};

const STEO_SOURCE_KEY = "steo_outlook";

export type MacroCollection = {
  modules: Partial<Record<EvidenceModuleKey, WeeklyEvidenceItem[]>>;
  riskPayload: MacroRiskPayload;
  riskAllSignals: RangeMacroSignal[];
  manifestEntries: SourceManifestEntry[];
  storageWeekEndingCandidate: string | null;
  storageObservationPresent: boolean;
  fundamentalsSnapshotPresent: boolean;
  steoRevisionHistoryPresent: boolean;
};

export async function collectMacroEvidence(pool: Pool | null, now: Date = new Date()): Promise<MacroCollection> {
  const generatedAt = generatedAtNow();

  const [marketMetricsResult, productionResult, demandResult, steoResult] = await Promise.allSettled([
    buildNormalizedMarketMetrics(generatedAt),
    fetchStateMarketedProductionTable(),
    fetchDemandTable(),
    fetchSteoTable()
  ]);

  const marketMetrics = marketMetricsResult.status === "fulfilled" ? marketMetricsResult.value : [];
  const byId = new Map(marketMetrics.map((metric) => [metric.id, metric]));
  const henryHubMetric = byId.get("henry_hub");
  const storageMetric = byId.get("storage");
  const productionMetric = byId.get("dry_gas_production");
  const lngMetric = byId.get("lng_exports");

  const productionStates = productionResult.status === "fulfilled" ? normalizeStateProduction(productionResult.value) : {};
  const demandSeries = demandResult.status === "fulfilled" ? normalizeDemand(demandResult.value) : undefined;
  const steoNormalized = steoResult.status === "fulfilled" ? normalizeSteoTable(steoResult.value) : undefined;

  const appalachia = buildAppalachiaProduction(productionStates);

  const forecastStartPeriod = productionMetric?.period ? shiftMonth(productionMetric.period, 1) : null;
  function forecastDirectionFor(key: SteoSeriesKey): ForecastDirection {
    const series = steoNormalized?.[key];
    if (!series) return null;
    const horizon = filterToForecastHorizon(series.points, forecastStartPeriod);
    if (horizon.length < 2) return null;
    const sorted = [...horizon].sort((a, b) => a.period.localeCompare(b.period));
    return classifyForecastDirection(sorted[0].value, sorted[sorted.length - 1].value);
  }

  const electricPower = demandSeries?.electricPower;
  const industrial = demandSeries?.industrial;

  const inputs: RangeMacroSignalInputs = {
    henryHub: { trendPct: freshTrendPct(henryHubMetric, 30), value: freshValue(henryHubMetric), period: henryHubMetric?.period ?? null },
    storage: { vs5yrPct: null, value: freshValue(storageMetric), period: storageMetric?.period ?? null },
    usGasSupply: { yoyPct: freshTrendPct(productionMetric, 12), value: freshValue(productionMetric), period: productionMetric?.period ?? null },
    appalachiaSupply: { yoyPct: appalachia.yearOverYearPct, value: appalachia.current, period: appalachia.period, statesIncluded: appalachia.statesIncluded },
    lngDemand: { yoyPct: freshTrendPct(lngMetric, 12), value: freshValue(lngMetric), period: lngMetric?.period ?? null, forecastDirection: forecastDirectionFor("lngExportsForecast") },
    powerDemand: { yoyPct: freshDemandYoy(electricPower), value: freshDemandValue(electricPower), period: electricPower?.period ?? null },
    industrialDemand: { yoyPct: freshDemandYoy(industrial), value: freshDemandValue(industrial), period: industrial?.period ?? null, forecastDirection: forecastDirectionFor("industrialConsumptionForecast") }
  };

  // storage.vs5yrPct is intentionally recomputed just below from the same
  // buildStorageComparison() this adapter's own compareStorageWeekly()
  // calls, rather than duplicated inline above -- one call, shared between
  // the risk-engine input and the evidence item's own comparisons.
  const storageComparisons = storageMetric && storageMetric.status === "ok" && storageMetric.freshness !== "stale" && storageMetric.freshness !== "unavailable"
    ? compareStorageWeekly(storageMetric.history, "lower48_storage", "Lower 48 Working Gas Storage")
    : [];
  const storageVs5yr = storageComparisons.find((c) => c.period === "vs5yrAvg");
  inputs.storage.vs5yrPct = storageVs5yr?.deltaPct ?? null;

  const allSignals = buildRangeMacroSignals(inputs);
  const rankedSignals = rankRangeMacroSignals(allSignals, 5);
  const riskPayload = buildMacroRiskPayload(rankedSignals, allSignals);

  const modules: Partial<Record<EvidenceModuleKey, WeeklyEvidenceItem[]>> = {};
  const manifestEntries: SourceManifestEntry[] = [];

  function pushCategory(category: EvidenceModuleKey, item: WeeklyEvidenceItem | null) {
    if (!item) return;
    modules[category] = [...(modules[category] ?? []), item];
  }

  // gas_pricing (Henry Hub, daily)
  {
    const freshness = henryHubMetric ? henryHubMetric.freshness : "unavailable";
    const value = freshValue(henryHubMetric);
    pushCategory("gas_pricing", {
      evidenceId: DRIVER_TO_EVIDENCE_ID.gas_pricing,
      category: "gas_pricing",
      metricKey: "henry_hub_spot",
      label: "Henry Hub Spot Price",
      currentValue: value,
      displayValue: value === null ? "--" : `$${value.toFixed(2)}/MMBtu`,
      unit: "$/MMBtu",
      period: henryHubMetric?.period ?? null,
      asOfDate: henryHubMetric?.period ?? null,
      sourceIds: ["macro_henry_hub"],
      freshness,
      comparisons: henryHubMetric ? compareDailyWeekly(henryHubMetric.history, "henry_hub_spot", "Henry Hub Spot Price") : [],
      rangeDrivers: ["gas_pricing"],
      materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
      metadata: { source: "EIA Henry Hub daily spot" }
    });
    manifestEntries.push({ key: "macro_henry_hub", label: "EIA Henry Hub daily spot price", period: henryHubMetric?.period ?? null, freshness, included: value !== null });
  }

  // storage (weekly, EIA Weekly Natural Gas Storage -- report identity source)
  {
    const freshness = storageMetric ? storageMetric.freshness : "unavailable";
    const value = freshValue(storageMetric);
    pushCategory("storage", {
      evidenceId: DRIVER_TO_EVIDENCE_ID.storage_levels,
      category: "storage",
      metricKey: "lower48_storage",
      label: "Lower 48 Working Gas Storage",
      currentValue: value,
      displayValue: moneyOrCountDisplay(value, "Bcf", 0),
      unit: "Bcf",
      period: storageMetric?.period ?? null,
      asOfDate: storageMetric?.period ?? null,
      sourceIds: ["macro_storage"],
      freshness,
      comparisons: storageComparisons,
      rangeDrivers: ["storage_levels"],
      materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
      metadata: { source: "EIA Weekly Natural Gas Storage Report" }
    });
    manifestEntries.push({ key: "macro_storage", label: "EIA Weekly Natural Gas Storage Report (Lower 48)", period: storageMetric?.period ?? null, freshness, included: value !== null });
  }

  // us_gas_supply (dry gas production, monthly)
  {
    const freshness = productionMetric ? productionMetric.freshness : "unavailable";
    const value = freshValue(productionMetric);
    pushCategory("us_gas_supply", {
      evidenceId: DRIVER_TO_EVIDENCE_ID.us_gas_supply,
      category: "us_gas_supply",
      metricKey: "dry_gas_production",
      label: "U.S. Dry Gas Production",
      currentValue: value,
      displayValue: moneyOrCountDisplay(value, "MMcf/mo", 0),
      unit: "MMcf/month",
      period: productionMetric?.period ?? null,
      asOfDate: productionMetric?.period ?? null,
      sourceIds: ["macro_dry_gas_production"],
      freshness,
      comparisons: productionMetric ? compareMonthlySeries(productionMetric.history, "dry_gas_production", "U.S. Dry Gas Production") : [],
      rangeDrivers: ["us_gas_supply"],
      materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
      metadata: { source: "EIA U.S. dry gas production" }
    });
    manifestEntries.push({ key: "macro_dry_gas_production", label: "EIA U.S. dry gas production", period: productionMetric?.period ?? null, freshness, included: value !== null });
  }

  // appalachia_supply (PA + WV + OH marketed production, monthly)
  {
    const freshness = appalachia.period ? calculateFreshness(appalachia.period, "monthly", now) : "unavailable";
    pushCategory("appalachia_supply", {
      evidenceId: DRIVER_TO_EVIDENCE_ID.appalachia_supply,
      category: "appalachia_supply",
      metricKey: "pa_wv_oh_marketed_production",
      label: "PA + WV + OH Marketed Production",
      currentValue: appalachia.current,
      displayValue: moneyOrCountDisplay(appalachia.current, "MMcf/mo", 0),
      unit: "MMcf/month",
      period: appalachia.period,
      asOfDate: appalachia.period,
      sourceIds: ["macro_appalachia_production"],
      freshness,
      comparisons: appalachia.history.length > 0 ? compareMonthlySeries(appalachia.history, "pa_wv_oh_marketed_production", "PA + WV + OH Marketed Production") : [],
      rangeDrivers: ["appalachia_supply"],
      materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
      metadata: { source: "EIA state marketed production (PA+WV+OH sum)", statesIncluded: appalachia.statesIncluded }
    });
    manifestEntries.push({ key: "macro_appalachia_production", label: "EIA PA + WV + OH marketed production", period: appalachia.period, freshness, included: appalachia.current !== null });
  }

  // lng_demand (U.S. LNG exports, monthly)
  {
    const freshness = lngMetric ? lngMetric.freshness : "unavailable";
    const value = freshValue(lngMetric);
    pushCategory("lng_demand", {
      evidenceId: DRIVER_TO_EVIDENCE_ID.lng_demand,
      category: "lng_demand",
      metricKey: "us_lng_exports",
      label: "U.S. LNG Exports",
      currentValue: value,
      displayValue: moneyOrCountDisplay(value, "MMcf/mo", 0),
      unit: "MMcf/month",
      period: lngMetric?.period ?? null,
      asOfDate: lngMetric?.period ?? null,
      sourceIds: ["macro_lng_exports"],
      freshness,
      comparisons: lngMetric ? compareMonthlySeries(lngMetric.history, "us_lng_exports", "U.S. LNG Exports") : [],
      rangeDrivers: ["lng_demand"],
      materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
      metadata: { source: "EIA U.S. LNG gross exports", forecastDirection: forecastDirectionFor("lngExportsForecast") }
    });
    manifestEntries.push({ key: "macro_lng_exports", label: "EIA U.S. LNG exports", period: lngMetric?.period ?? null, freshness, included: value !== null });
  }

  // power_data_center_demand (electric power sector gas demand, monthly)
  {
    const freshness = electricPower ? electricPower.freshness : "unavailable";
    const value = freshDemandValue(electricPower);
    pushCategory("power_data_center_demand", {
      evidenceId: DRIVER_TO_EVIDENCE_ID.power_data_center_demand,
      category: "power_data_center_demand",
      metricKey: "electric_power_gas_demand",
      label: "Electric Power Sector Gas Demand",
      currentValue: value,
      displayValue: moneyOrCountDisplay(value, "MMcf/mo", 0),
      unit: "MMcf/month",
      period: electricPower?.period ?? null,
      asOfDate: electricPower?.period ?? null,
      sourceIds: ["macro_power_demand"],
      freshness,
      comparisons: electricPower ? compareMonthlySeries(electricPower.history, "electric_power_gas_demand", "Electric Power Sector Gas Demand") : [],
      rangeDrivers: ["power_data_center_demand"],
      materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
      metadata: { source: "EIA electric power sector gas consumption" }
    });
    manifestEntries.push({ key: "macro_power_demand", label: "EIA electric power sector gas demand", period: electricPower?.period ?? null, freshness, included: value !== null });
  }

  // industrial_demand (monthly)
  {
    const freshness = industrial ? industrial.freshness : "unavailable";
    const value = freshDemandValue(industrial);
    pushCategory("industrial_demand", {
      evidenceId: DRIVER_TO_EVIDENCE_ID.industrial_demand,
      category: "industrial_demand",
      metricKey: "industrial_gas_demand",
      label: "Industrial Gas Demand",
      currentValue: value,
      displayValue: moneyOrCountDisplay(value, "MMcf/mo", 0),
      unit: "MMcf/month",
      period: industrial?.period ?? null,
      asOfDate: industrial?.period ?? null,
      sourceIds: ["macro_industrial_demand"],
      freshness,
      comparisons: industrial ? compareMonthlySeries(industrial.history, "industrial_gas_demand", "Industrial Gas Demand") : [],
      rangeDrivers: ["industrial_demand"],
      materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
      metadata: { source: "EIA industrial sector gas consumption", forecastDirection: forecastDirectionFor("industrialConsumptionForecast") }
    });
    manifestEntries.push({ key: "macro_industrial_demand", label: "EIA industrial gas demand", period: industrial?.period ?? null, freshness, included: value !== null });
  }

  // steo_outlook (all 9 verified STEO series) -- optional: degrades gracefully if the live fetch failed or the DB is unavailable for vintage comparison.
  let steoRevisionHistoryPresent = false;
  if (steoNormalized) {
    const normalizedSteo: Partial<Record<SteoSeriesKey, SteoNormalizedSeries>> = steoNormalized;
    if (pool) {
      try {
        await refreshSteoSnapshots(pool);
      } catch {
        // A failed persistence attempt never blocks building this run's
        // evidence from the live fetch already in hand -- steoVintage
        // comparisons simply stay unavailable below for this run.
      }
    }

    const steoEntries = Object.entries(normalizedSteo) as Array<[SteoSeriesKey, SteoNormalizedSeries]>;
    for (const [seriesKey, series] of steoEntries) {
      const horizon = filterToForecastHorizon(series.points, forecastStartPeriod);
      const nearTerm = [...horizon].sort((a, b) => a.period.localeCompare(b.period))[0] ?? null;
      let steoComparisons: WeeklyEvidenceItem["comparisons"] = [];
      if (pool) {
        try {
          const seriesId = EIA_STEO_SERIES[seriesKey];
          const { current, previous } = await getCurrentAndPreviousSteoSnapshot(pool, seriesId);
          if (current && previous) {
            const revisions = computeForecastRevisions(previous, current);
            steoComparisons = compareSteoVintage(revisions, seriesKey, series.label);
            if (steoComparisons.length > 0) steoRevisionHistoryPresent = true;
          }
        } catch {
          steoComparisons = [];
        }
      }
      pushCategory("steo_outlook", {
        evidenceId: `steo_outlook:${seriesKey}`,
        category: "steo_outlook",
        metricKey: seriesKey,
        label: series.label,
        currentValue: nearTerm?.value ?? null,
        displayValue: nearTerm ? moneyOrCountDisplay(nearTerm.value, series.unit, 2) : "--",
        unit: series.unit,
        period: nearTerm?.period ?? null,
        asOfDate: nearTerm?.period ?? null,
        sourceIds: [STEO_SOURCE_KEY],
        freshness: nearTerm ? "current" : "unavailable",
        comparisons: steoComparisons,
        rangeDrivers: [],
        materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
        metadata: { seriesId: EIA_STEO_SERIES[seriesKey] }
      });
    }
    manifestEntries.push({ key: STEO_SOURCE_KEY, label: "EIA Short-Term Energy Outlook (STEO)", period: forecastStartPeriod, freshness: "current", included: true });
  } else {
    manifestEntries.push({ key: STEO_SOURCE_KEY, label: "EIA Short-Term Energy Outlook (STEO)", period: null, freshness: "unavailable", included: false });
  }

  // deterministic_risk_opportunity -- lightweight pointers into the already-built evidence above, never a duplicate copy of their metrics.
  const rankedItems: WeeklyEvidenceItem[] = rankedSignals.map((signal, index) => ({
    evidenceId: `deterministic_risk_opportunity:${signal.driver}`,
    category: "deterministic_risk_opportunity",
    metricKey: signal.driver,
    label: signal.label,
    currentValue: signal.pressurePct,
    displayValue: signal.state,
    unit: "%",
    period: signal.period,
    asOfDate: signal.period,
    sourceIds: [DRIVER_TO_EVIDENCE_ID[signal.driver]].filter(Boolean),
    freshness: signal.period ? "current" : "unavailable",
    comparisons: [],
    rangeDrivers: [signal.driver],
    materialityInputs: {
      isNewThisWeek: false,
      changedSincePreviousReport: false,
      riskSeverityRank: index + 1,
      riskState: signal.state,
      rangeImpactDirection: null,
      rangeImpactStrength: null,
      comparisonMagnitudePct: signal.pressurePct
    },
    metadata: { riskRank: index + 1, riskState: signal.state, deterministicReason: signal.reason, relatedEvidenceId: DRIVER_TO_EVIDENCE_ID[signal.driver] }
  }));
  if (rankedItems.length > 0) modules.deterministic_risk_opportunity = rankedItems;

  return {
    modules,
    riskPayload,
    riskAllSignals: allSignals,
    manifestEntries,
    storageWeekEndingCandidate: storageMetric && storageMetric.status === "ok" ? storageMetric.period : null,
    storageObservationPresent: storageMetric !== undefined && storageMetric.status === "ok" && freshValue(storageMetric) !== null,
    fundamentalsSnapshotPresent: [henryHubMetric, productionMetric, lngMetric].some((metric) => metric && metric.status === "ok"),
    steoRevisionHistoryPresent
  };
}

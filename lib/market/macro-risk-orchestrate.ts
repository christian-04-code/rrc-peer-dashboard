import { buildNormalizedMarketMetrics } from "@/lib/market/build-market-metrics";
import { fetchDemandTable, fetchStateMarketedProductionTable, fetchSteoTable } from "@/lib/eia/macro-fundamentals";
import { normalizeDemand, normalizeStateProduction } from "@/lib/market/macro-fundamentals";
import { normalizeSteoTable } from "@/lib/market/macro-steo";
import {
  buildAppalachiaProduction,
  buildStorageComparison,
  monthlyMmcfToBcfd,
  monthlyYoy,
  periodChangePct,
  shiftMonth,
  filterToForecastHorizon
} from "@/lib/market/macro-analytics";
import {
  buildMacroRiskPayload,
  buildRangeMacroSignals,
  classifyForecastDirection,
  rankRangeMacroSignals,
  type MacroRiskPayload,
  type RangeMacroSignal,
  type RangeMacroSignalInputs
} from "@/lib/market/macro-risk-engine";
import { computeMacroSummaryFingerprint } from "@/lib/market/persistence/summary-repo";
import type { DemandMetric } from "@/lib/market/macro-types";
import type { NormalizedMarketMetric } from "@/lib/market/types";
import type { SteoSeriesKey } from "@/lib/market/macro-steo-types";

export type MacroRiskSnapshot = {
  allSignals: RangeMacroSignal[];
  rankedSignals: RangeMacroSignal[];
  payload: MacroRiskPayload;
  fingerprint: string;
};

/** A metric that failed to fetch, is unavailable, or is stale is treated identically to a missing metric -- Section 9 forbids inferring a risk state from stale data, not just missing data. */
function freshTrendPct(metric: NormalizedMarketMetric | undefined, periods: number): number | null {
  if (!metric || metric.status !== "ok" || metric.freshness === "stale" || metric.freshness === "unavailable") return null;
  return periodChangePct(metric, periods);
}

function freshValue(metric: NormalizedMarketMetric | undefined): number | null {
  if (!metric || metric.status !== "ok" || metric.freshness === "stale" || metric.freshness === "unavailable") return null;
  return metric.value;
}

function freshDemandYoy(metric: DemandMetric | undefined): number | null {
  if (!metric || metric.status !== "ok" || metric.freshness === "stale" || metric.freshness === "unavailable") return null;
  return monthlyYoy(metric.history);
}

function freshDemandValue(metric: DemandMetric | undefined): number | null {
  if (!metric || metric.status !== "ok" || metric.freshness === "stale" || metric.freshness === "unavailable") return null;
  return metric.history[0]?.value ?? null;
}

/**
 * Fetches everything the deterministic risk engine needs, fresh, from the
 * exact same underlying EIA fetchers/normalizers Phase 6C's Macro tabs
 * already use (no duplicated business logic) -- one failed source degrades
 * only the signals that depend on it to UNAVAILABLE, never the whole
 * snapshot (Section 9/17: the widget must still render if one source
 * fails). Callers: the browser-facing /api/macro/risk route (read-only,
 * never triggers AI) and the /api/cron/macro route (may trigger AI
 * generation when the resulting fingerprint has no cached summary yet).
 */
export async function buildMacroRiskSnapshot(maxRankedItems = 5): Promise<MacroRiskSnapshot> {
  const generatedAt = new Date().toISOString();

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
  const storageComparison = storageMetric && storageMetric.status === "ok" && storageMetric.freshness !== "stale" && storageMetric.freshness !== "unavailable"
    ? buildStorageComparison(storageMetric.history)
    : null;

  // Same "one shared STEO forecast-start boundary, derived from the most
  // reliable monthly actual" convention Phase 6C's EIA Outlook module uses.
  const forecastStartPeriod = productionMetric?.period ? shiftMonth(productionMetric.period, 1) : null;

  function forecastDirectionFor(key: SteoSeriesKey) {
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
    storage: { vs5yrPct: storageComparison?.versusAveragePct ?? null, value: freshValue(storageMetric), period: storageMetric?.period ?? null },
    usGasSupply: {
      yoyPct: freshTrendPct(productionMetric, 12),
      value: monthlyMmcfToBcfd(freshValue(productionMetric), productionMetric?.period ?? null),
      period: productionMetric?.period ?? null
    },
    appalachiaSupply: {
      yoyPct: appalachia.yearOverYearPct,
      value: appalachia.current,
      period: appalachia.period,
      statesIncluded: appalachia.statesIncluded
    },
    lngDemand: {
      yoyPct: freshTrendPct(lngMetric, 12),
      value: freshValue(lngMetric),
      period: lngMetric?.period ?? null,
      forecastDirection: forecastDirectionFor("lngExportsForecast")
    },
    powerDemand: { yoyPct: freshDemandYoy(electricPower), value: freshDemandValue(electricPower), period: electricPower?.period ?? null },
    industrialDemand: {
      yoyPct: freshDemandYoy(industrial),
      value: freshDemandValue(industrial),
      period: industrial?.period ?? null,
      forecastDirection: forecastDirectionFor("industrialConsumptionForecast")
    }
  };

  const allSignals = buildRangeMacroSignals(inputs);
  const rankedSignals = rankRangeMacroSignals(allSignals, maxRankedItems);
  const payload = buildMacroRiskPayload(rankedSignals, allSignals);
  const fingerprint = computeMacroSummaryFingerprint(payload);

  return { allSignals, rankedSignals, payload, fingerprint };
}

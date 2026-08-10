import type { EiaTableRow, EiaTableResult } from "@/lib/eia/client";
import { EIA_SERIES } from "@/lib/eia/series";
import { buildStorageComparison, calculateFreshness } from "@/lib/market/macro-analytics";
import type {
  DemandMetric,
  DemandSeriesId,
  MacroFundamentalsResponse,
  RegionalStorageMetric,
  StateProductionMetric,
  StorageRegionId
} from "@/lib/market/macro-types";
import { getStateCode, getStateName, STORAGE_REGION_LABELS } from "@/lib/market/storage-regions";
import type { MarketObservation } from "@/lib/market/types";

const STORAGE_SERIES_TO_REGION = new Map<string, StorageRegionId>(
  Object.entries(EIA_SERIES.regionalStorage).map(([region, series]) => [series, region as StorageRegionId])
);
const DEMAND_SERIES_TO_ID = new Map<string, DemandSeriesId>(
  Object.entries(EIA_SERIES.demand).map(([id, series]) => [series, id as DemandSeriesId])
);
const DEMAND_LABELS: Record<DemandSeriesId, string> = {
  electricPower: "Electric power",
  industrial: "Industrial",
  residential: "Residential",
  commercial: "Commercial"
};

function normalizedSeries(row: EiaTableRow): string {
  return String(row.series ?? "").replace(/^NG\./, "").replace(/\.[DMWAY]$/, "");
}

function observations(rows: EiaTableRow[]): MarketObservation[] {
  return rows
    .map((row) => ({ period: row.period, value: row.value }))
    .sort((a, b) => b.period.localeCompare(a.period));
}

function offsetMonthlyPeriod(period: string, months: number): string | null {
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function calculatePctChange(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function unavailableStorageRegion(id: StorageRegionId, fetchedAt: string): RegionalStorageMetric {
  return {
    id,
    label: STORAGE_REGION_LABELS[id],
    seriesId: EIA_SERIES.regionalStorage[id],
    unit: "Bcf",
    frequency: "weekly",
    status: "unavailable",
    freshness: "unavailable",
    period: null,
    fetchedAt,
    current: null,
    priorWeek: null,
    weeklyChange: null,
    yearAgo: null,
    yearAgoPct: null,
    fiveYearAverage: null,
    fiveYearPct: null,
    history: []
  };
}

export function normalizeRegionalStorage(result: EiaTableResult): Record<StorageRegionId, RegionalStorageMetric> {
  const grouped = new Map<StorageRegionId, EiaTableRow[]>();
  for (const row of result.rows) {
    const region = STORAGE_SERIES_TO_REGION.get(normalizedSeries(row));
    if (!region) continue;
    const current = grouped.get(region) ?? [];
    current.push(row);
    grouped.set(region, current);
  }

  return Object.fromEntries(
    (Object.keys(STORAGE_REGION_LABELS) as StorageRegionId[]).map((id) => {
      const history = observations(grouped.get(id) ?? []);
      const comparison = buildStorageComparison(history);
      if (!comparison || !history[0]) return [id, unavailableStorageRegion(id, result.fetchedAt)];
      return [id, {
        id,
        label: STORAGE_REGION_LABELS[id],
        seriesId: EIA_SERIES.regionalStorage[id],
        unit: "Bcf" as const,
        frequency: "weekly" as const,
        status: "ok" as const,
        freshness: calculateFreshness(history[0].period, "weekly"),
        period: history[0].period,
        fetchedAt: result.fetchedAt,
        current: comparison.latest,
        priorWeek: history[1]?.value ?? null,
        weeklyChange: comparison.weeklyChange,
        yearAgo: comparison.priorYear,
        yearAgoPct: calculatePctChange(comparison.latest, comparison.priorYear),
        fiveYearAverage: comparison.fiveYearAverage,
        fiveYearPct: calculatePctChange(comparison.latest, comparison.fiveYearAverage),
        history
      }];
    })
  ) as Record<StorageRegionId, RegionalStorageMetric>;
}

export function normalizeStateProduction(result: EiaTableResult): Record<string, StateProductionMetric> {
  const grouped = new Map<string, { name: string; rows: EiaTableRow[] }>();
  for (const row of result.rows) {
    const stateName = typeof row["area-name"] === "string" ? row["area-name"] : "";
    const geography = typeof row.duoarea === "string" ? row.duoarea : "";
    const geographyCode = geography.replace(/^S/i, "").toUpperCase();
    const stateCode = getStateName(geographyCode) ? geographyCode : getStateCode(stateName);
    if (!stateCode) continue;
    const current = grouped.get(stateCode) ?? { name: getStateName(stateCode) ?? stateName, rows: [] };
    current.rows.push(row);
    grouped.set(stateCode, current);
  }

  return Object.fromEntries(Array.from(grouped.entries()).flatMap(([stateCode, group]) => {
    const history = observations(group.rows);
    const latest = history[0];
    if (!latest) return [];
    const byPeriod = new Map(history.map((point) => [point.period, point.value]));
    const priorMonthPeriod = offsetMonthlyPeriod(latest.period, -1);
    const yearAgoPeriod = offsetMonthlyPeriod(latest.period, -12);
    const priorMonth = priorMonthPeriod ? byPeriod.get(priorMonthPeriod) ?? null : null;
    const yearAgo = yearAgoPeriod ? byPeriod.get(yearAgoPeriod) ?? null : null;
    const metric: StateProductionMetric = {
      stateCode,
      stateName: group.name,
      unit: "MMcf/month",
      frequency: "monthly",
      status: "ok",
      period: latest.period,
      fetchedAt: result.fetchedAt,
      current: latest.value,
      priorMonth,
      monthOverMonthPct: calculatePctChange(latest.value, priorMonth),
      yearAgo,
      yearOverYearPct: calculatePctChange(latest.value, yearAgo),
      history
    };
    return [[stateCode, metric]];
  }));
}

function unavailableDemand(id: DemandSeriesId, fetchedAt: string): DemandMetric {
  return {
    id,
    label: DEMAND_LABELS[id],
    seriesId: EIA_SERIES.demand[id],
    unit: "MMcf/month",
    frequency: "monthly",
    status: "unavailable",
    freshness: "unavailable",
    period: null,
    fetchedAt,
    history: []
  };
}

export function normalizeDemand(result: EiaTableResult): Record<DemandSeriesId, DemandMetric> {
  const grouped = new Map<DemandSeriesId, EiaTableRow[]>();
  for (const row of result.rows) {
    const id = DEMAND_SERIES_TO_ID.get(normalizedSeries(row));
    if (!id) continue;
    const current = grouped.get(id) ?? [];
    current.push(row);
    grouped.set(id, current);
  }

  return Object.fromEntries((Object.keys(DEMAND_LABELS) as DemandSeriesId[]).map((id) => {
    const history = observations(grouped.get(id) ?? []);
    if (!history[0]) return [id, unavailableDemand(id, result.fetchedAt)];
    return [id, {
      id,
      label: DEMAND_LABELS[id],
      seriesId: EIA_SERIES.demand[id],
      unit: "MMcf/month" as const,
      frequency: "monthly" as const,
      status: "ok" as const,
      freshness: calculateFreshness(history[0].period, "monthly"),
      period: history[0].period,
      fetchedAt: result.fetchedAt,
      history
    }];
  })) as Record<DemandSeriesId, DemandMetric>;
}

export function unavailableMacroFundamentals(generatedAt: string): MacroFundamentalsResponse {
  const regionEntries = (Object.keys(STORAGE_REGION_LABELS) as StorageRegionId[]).map((id) =>
    [id, unavailableStorageRegion(id, generatedAt)]
  );
  const demandEntries = (Object.keys(DEMAND_LABELS) as DemandSeriesId[]).map((id) =>
    [id, unavailableDemand(id, generatedAt)]
  );
  return {
    generatedAt,
    source: "U.S. EIA",
    storage: { status: "unavailable", regions: Object.fromEntries(regionEntries) as Record<StorageRegionId, RegionalStorageMetric> },
    production: { status: "unavailable", measure: "Marketed natural gas production", states: {} },
    demand: { status: "unavailable", series: Object.fromEntries(demandEntries) as Record<DemandSeriesId, DemandMetric> }
  };
}

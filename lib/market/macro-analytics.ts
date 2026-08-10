import type {
  MarketFrequency,
  MarketFreshness,
  MarketObservation,
  NormalizedMarketMetric
} from "@/lib/market/types";

export type StorageComparison = {
  latest: number;
  priorYear: number | null;
  fiveYearAverage: number | null;
  fiveYearMin: number | null;
  fiveYearMax: number | null;
  versusAverage: number | null;
  versusAveragePct: number | null;
  yearOverYear: number | null;
  weeklyChange: number | null;
};

export type StorageProfilePoint = {
  week: number;
  current: number | null;
  priorYear: number | null;
  fiveYearAverage: number | null;
  fiveYearMin: number | null;
  fiveYearMax: number | null;
};

export type SnapshotState = {
  label: string;
  state: string;
  tone: "positive" | "neutral" | "negative";
  rule: string;
  inputs: string;
};

export type MacroSnapshotContext = {
  eastStoragePct?: number | null;
  paProductionYoyPct?: number | null;
};

const DAY_MS = 86_400_000;
const CURRENT_AGE_DAYS: Record<MarketFrequency, number> = {
  daily: 5,
  weekly: 10,
  monthly: 50,
  annual: 400
};

function observationDate(period: string, frequency: MarketFrequency): Date | null {
  let normalized = period;
  if (frequency === "monthly" && /^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split("-").map(Number);
    return new Date(Date.UTC(year, month, 0));
  }
  if (frequency === "annual" && /^\d{4}$/.test(period)) normalized = `${period}-12-31`;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function calculateFreshness(
  period: string | null,
  frequency: MarketFrequency,
  now = new Date()
): MarketFreshness {
  if (!period) return "unavailable";
  const date = observationDate(period, frequency);
  if (!date) return "unavailable";
  const ageDays = Math.max(0, (now.getTime() - date.getTime()) / DAY_MS);
  return ageDays <= CURRENT_AGE_DAYS[frequency] ? "current" : "stale";
}

function isoWeek(date: Date): number {
  const working = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = working.getUTCDay() || 7;
  working.setUTCDate(working.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(working.getUTCFullYear(), 0, 1));
  return Math.ceil((((working.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);
}

function pointDate(point: MarketObservation): Date | null {
  return observationDate(point.period, "weekly");
}

export function buildStorageComparison(
  history: MarketObservation[]
): StorageComparison | null {
  const latestPoint = history[0];
  const priorWeek = history[1];
  const latestDate = latestPoint ? pointDate(latestPoint) : null;
  if (!latestPoint || !latestDate) return null;

  const latestYear = latestDate.getUTCFullYear();
  const targetWeek = isoWeek(latestDate);
  const references = new Map<number, number>();

  for (const point of history.slice(1)) {
    const date = pointDate(point);
    if (!date || isoWeek(date) !== targetWeek) continue;
    const year = date.getUTCFullYear();
    if (year < latestYear && year >= latestYear - 5 && !references.has(year)) {
      references.set(year, point.value);
    }
  }

  const priorYear = references.get(latestYear - 1) ?? null;
  const fiveYearValues = Array.from(references.values());
  const fiveYearAverage = fiveYearValues.length === 5
    ? fiveYearValues.reduce((sum, value) => sum + value, 0) / fiveYearValues.length
    : null;
  const versusAverage = fiveYearAverage === null ? null : latestPoint.value - fiveYearAverage;

  return {
    latest: latestPoint.value,
    priorYear,
    fiveYearAverage,
    fiveYearMin: fiveYearValues.length === 5 ? Math.min(...fiveYearValues) : null,
    fiveYearMax: fiveYearValues.length === 5 ? Math.max(...fiveYearValues) : null,
    versusAverage,
    versusAveragePct:
      fiveYearAverage && versusAverage !== null ? (versusAverage / fiveYearAverage) * 100 : null,
    yearOverYear: priorYear === null ? null : latestPoint.value - priorYear,
    weeklyChange: priorWeek ? latestPoint.value - priorWeek.value : null
  };
}

export function buildStorageProfile(history: MarketObservation[]): StorageProfilePoint[] {
  const latestDate = history[0] ? pointDate(history[0]) : null;
  if (!latestDate) return [];
  const currentYear = latestDate.getUTCFullYear();
  const byYearWeek = new Map<string, number>();

  for (const point of history) {
    const date = pointDate(point);
    if (!date) continue;
    byYearWeek.set(`${date.getUTCFullYear()}-${isoWeek(date)}`, point.value);
  }

  return Array.from({ length: 53 }, (_, index) => {
    const week = index + 1;
    const referenceValues = Array.from({ length: 5 }, (__, yearIndex) =>
      byYearWeek.get(`${currentYear - yearIndex - 1}-${week}`)
    ).filter((value): value is number => value !== undefined);
    const completeReference = referenceValues.length === 5;
    return {
      week,
      current: byYearWeek.get(`${currentYear}-${week}`) ?? null,
      priorYear: byYearWeek.get(`${currentYear - 1}-${week}`) ?? null,
      fiveYearAverage: completeReference
        ? referenceValues.reduce((sum, value) => sum + value, 0) / 5
        : null,
      fiveYearMin: completeReference ? Math.min(...referenceValues) : null,
      fiveYearMax: completeReference ? Math.max(...referenceValues) : null
    };
  });
}

export function periodChange(metric: NormalizedMarketMetric, periods = 1): number | null {
  const latest = metric.history[0];
  const prior = metric.history[periods];
  return latest && prior ? latest.value - prior.value : null;
}

export function periodChangePct(metric: NormalizedMarketMetric, periods = 1): number | null {
  const latest = metric.history[0];
  const prior = metric.history[periods];
  if (!latest || !prior || prior.value === 0) return null;
  return ((latest.value - prior.value) / Math.abs(prior.value)) * 100;
}

export function formatMetricValue(metric?: NormalizedMarketMetric): string {
  if (!metric || metric.status !== "ok" || metric.value === null) return "--";
  const noDecimals = new Set(["storage", "lng_exports", "dry_gas_production", "propane_stocks"]);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: noDecimals.has(metric.id) ? 0 : 2
  }).format(metric.value);
}

function toneFor(state: string): SnapshotState["tone"] {
  if (["Tightening", "Expanding", "Improving", "Supportive", "Below Normal"].includes(state)) return "positive";
  if (["Loosening", "Contracting", "Weakening", "Weak", "Above Normal"].includes(state)) return "negative";
  return "neutral";
}

export function buildMacroSnapshot(metrics: NormalizedMarketMetric[], context: MacroSnapshotContext = {}): SnapshotState[] {
  const byId = new Map(metrics.map((metric) => [metric.id, metric]));
  const storageMetric = byId.get("storage");
  const lngMetric = byId.get("lng_exports");
  const propaneMetric = byId.get("propane_stocks");
  const storage = storageMetric ? buildStorageComparison(storageMetric.history) : null;
  const storagePct = storage?.versusAveragePct ?? null;
  const lngYoY = lngMetric ? periodChangePct(lngMetric, 12) : null;
  const propaneFourWeek = propaneMetric ? periodChangePct(propaneMetric, 4) : null;

  const storageState = storagePct === null ? "Unavailable" : storagePct <= -5 ? "Below Normal" : storagePct >= 5 ? "Above Normal" : "Near Normal";
  const lngState = lngYoY === null ? "Unavailable" : lngYoY >= 5 ? "Expanding" : lngYoY <= -5 ? "Contracting" : "Stable";
  const gasState = storageState === "Below Normal" && lngState === "Expanding"
    ? "Tightening"
    : storageState === "Above Normal" && lngState === "Contracting"
      ? "Loosening"
      : storageState === "Unavailable" && lngState === "Unavailable" ? "Unavailable" : "Balanced";
  const nglState = propaneFourWeek === null ? "Unavailable" : propaneFourWeek <= -5 ? "Supportive" : propaneFourWeek >= 5 ? "Weak" : "Neutral";
  const eastStoragePct = context.eastStoragePct ?? null;
  const paProductionYoy = context.paProductionYoyPct ?? null;
  const appalachiaState = eastStoragePct === null || lngYoY === null
    ? "Unavailable"
    : eastStoragePct <= -5 && lngYoY >= 5
      ? "Improving"
      : eastStoragePct >= 5 && lngYoY <= -5 ? "Weakening" : "Neutral";

  return [
    {
      label: "Natural Gas", state: gasState, tone: toneFor(gasState),
      rule: "Tightening requires storage at least 5% below normal and LNG exports growing at least 5% year over year; loosening requires the inverse.",
      inputs: `Storage vs 5-year average: ${formatPct(storagePct)}; LNG exports YoY: ${formatPct(lngYoY)}.`
    },
    {
      label: "Storage", state: storageState, tone: toneFor(storageState),
      rule: "Below/above normal begins at -5%/+5% versus the same-week five-year average.",
      inputs: `Current deviation: ${formatPct(storagePct)}.`
    },
    {
      label: "LNG", state: lngState, tone: toneFor(lngState),
      rule: "Expanding/contracting begins at +5%/-5% year over year using native monthly observations.",
      inputs: `Latest monthly YoY change: ${formatPct(lngYoY)}.`
    },
    {
      label: "Appalachia", state: appalachiaState, tone: toneFor(appalachiaState),
      rule: "Improving requires East storage at least 5% below normal and LNG exports growing at least 5% YoY; weakening requires the inverse.",
      inputs: `East storage vs 5-year average: ${formatPct(eastStoragePct)}; LNG exports YoY: ${formatPct(lngYoY)}; PA marketed production YoY: ${formatPct(paProductionYoy)}.`
    },
    {
      label: "NGL", state: nglState, tone: toneFor(nglState),
      rule: "Propane inventories down/up at least 5% over four weeks are supportive/weak; otherwise neutral.",
      inputs: `Propane inventory four-week change: ${formatPct(propaneFourWeek)}.`
    }
  ];
}

export function formatPct(value: number | null): string {
  return value === null ? "--" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function formatDelta(value: number | null, unit: string): string {
  if (value === null) return "--";
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Math.abs(value));
  return `${value >= 0 ? "+" : "−"}${formatted} ${unit}`;
}

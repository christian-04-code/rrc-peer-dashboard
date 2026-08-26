import type {
  MarketFrequency,
  MarketFreshness,
  MarketObservation,
  NormalizedMarketMetric
} from "@/lib/market/types";
import type { StateProductionMetric } from "@/lib/market/macro-types";

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

export type RrcMacroRisk = {
  title: string;
  explanation: string;
  supportingMetrics: string;
  tone: "negative" | "neutral";
  category: "storage" | "appalachia-supply" | "lng-demand" | "henry-hub" | "limited" | "unavailable";
};

const DAY_MS = 86_400_000;
const CURRENT_AGE_DAYS: Record<MarketFrequency, number> = {
  daily: 5,
  weekly: 10,
  monthly: 50,
  annual: 400
};

// Official observations do not all publish on the same cadence. Values outside
// the normal current window can still be the newest valid release, so keep that
// publication lag distinct from a genuinely stale feed.
const LAGGED_AGE_DAYS: Record<MarketFrequency, number> = {
  daily: 14,
  weekly: 21,
  monthly: 120,
  annual: 800
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
  if (ageDays <= CURRENT_AGE_DAYS[frequency]) return "current";
  return ageDays <= LAGGED_AGE_DAYS[frequency] ? "lagged" : "stale";
}

export function monthlyMmcfToBcfd(value: number | null, period: string | null): number | null {
  if (value === null || !period || !/^\d{4}-\d{2}$/.test(period)) return null;
  const [year, month] = period.split("-").map(Number);
  if (month < 1 || month > 12) return null;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return value / days / 1000;
}

/**
 * Converts a raw MMcf/month observation series (the unit every EIA
 * fundamentals actual -- production, LNG exports, sector demand -- uses) to
 * Bcf/d, matching EIA STEO's own "billion cubic feet per day" unit
 * convention. Required before charting any actual series against a STEO
 * forecast series on the same axis: MMcf/month and Bcf/d differ by roughly
 * three orders of magnitude plus a days-in-month factor, so an unconverted
 * overlay silently flattens whichever series is smaller -- exactly the kind
 * of incompatible-unit combination this project's tests forbid. A period
 * that fails to parse is dropped, never coerced to a wrong value.
 */
export function toBcfdSeries(history: MarketObservation[]): MarketObservation[] {
  return history
    .map((point) => ({ period: point.period, value: monthlyMmcfToBcfd(point.value, point.period) }))
    .filter((point): point is MarketObservation => point.value !== null);
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

export type AppalachiaProductionSummary = {
  /** State codes actually summed. EIA's PA/WV/OH marketed production is the closest available Appalachia proxy, not an official "Marcellus" series -- callers must label it as "PA + WV + OH marketed production", never as "Marcellus production". */
  statesIncluded: string[];
  history: MarketObservation[];
  current: number | null;
  period: string | null;
  monthOverMonthPct: number | null;
  yearOverYearPct: number | null;
};

export function shiftMonth(period: string, delta: number): string | null {
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  const [year, month] = period.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

/**
 * EIA STEO series carry a long historical tail alongside the forecast
 * horizon (confirmed live: STEO's Henry Hub and dry-gas series both span
 * 2009-07 through the outlook's final forecast month in one continuous
 * array, roughly 220 monthly points -- not just the forward-looking
 * projection). Labeling that whole span "(forecast)" and dashing it would
 * mislabel over a decade of EIA-reported history as a projection. This
 * derives the one forecast-start boundary shared by every series in a
 * single STEO publication/fetch from the most reliable monthly actual this
 * project has (dry gas production), and filters a raw points array down to
 * only the genuine forward-looking horizon.
 */
export function filterToForecastHorizon<T extends { period: string }>(points: T[], forecastStartPeriod: string | null): T[] {
  if (!forecastStartPeriod) return points;
  return points.filter((point) => point.period >= forecastStartPeriod);
}

/**
 * Sums PA + WV + OH marketed production for every period all three states
 * report -- a period where any of the three is missing is excluded entirely
 * rather than summing the states that do have data, so the total never
 * silently understates supply as if a non-reporting state produced zero.
 */
export function buildAppalachiaProduction(states: Record<string, StateProductionMetric>): AppalachiaProductionSummary {
  const codes = ["PA", "WV", "OH"].filter((code) => states[code]);
  if (codes.length === 0) {
    return { statesIncluded: [], history: [], current: null, period: null, monthOverMonthPct: null, yearOverYearPct: null };
  }

  const valueByPeriod = codes.map((code) => new Map(states[code].history.map((point) => [point.period, point.value])));
  const commonPeriods = [...valueByPeriod[0].keys()].filter((period) => valueByPeriod.every((map) => map.has(period)));
  const history: MarketObservation[] = commonPeriods
    .sort((a, b) => (a < b ? 1 : -1))
    // Every map in valueByPeriod is guaranteed to have `period` by the commonPeriods
    // filter above, so this is a real, always-present value, not a missing-value default.
    .map((period) => ({ period, value: valueByPeriod.reduce((sum, map) => sum + (map.get(period) as number), 0) }));

  const latest = history[0] ?? null;
  const prior = history[1] ?? null;
  const yearAgoPeriod = latest ? shiftMonth(latest.period, -12) : null;
  const yearAgo = yearAgoPeriod ? history.find((point) => point.period === yearAgoPeriod) ?? null : null;

  return {
    statesIncluded: codes,
    history,
    current: latest?.value ?? null,
    period: latest?.period ?? null,
    monthOverMonthPct: latest && prior && prior.value !== 0 ? ((latest.value - prior.value) / Math.abs(prior.value)) * 100 : null,
    yearOverYearPct: latest && yearAgo && yearAgo.value !== 0 ? ((latest.value - yearAgo.value) / Math.abs(yearAgo.value)) * 100 : null
  };
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

export type GasBalanceClassification = {
  storageState: "Below Normal" | "Near Normal" | "Above Normal" | "Unavailable";
  lngState: "Contracting" | "Stable" | "Expanding" | "Unavailable";
  gasState: "Tightening" | "Balanced" | "Loosening" | "Unavailable";
  storagePct: number | null;
  lngYoY: number | null;
};

/**
 * The one Gas Balance classification -- used by both the Macro Snapshot
 * evidence list and the dedicated Gas Balance topic module (Section 5: one
 * source of truth per metric). Deliberately does not combine marketed
 * production with sector consumption in a raw arithmetic supply-minus-demand
 * figure -- those EIA series have different scope/definitions (marketed
 * production vs. delivered consumption, different unit conventions), and
 * mixing them would be exactly the incompatible-unit aggregation this
 * project's tests forbid. Storage deviation and LNG export growth are both
 * pre-normalized to percentages and are the same two signals the pre-6C
 * "Natural Gas" snapshot row already used, kept unchanged here.
 */
export function classifyGasBalance(storagePct: number | null, lngYoY: number | null): GasBalanceClassification {
  const storageState = storagePct === null ? "Unavailable" : storagePct <= -5 ? "Below Normal" : storagePct >= 5 ? "Above Normal" : "Near Normal";
  const lngState = lngYoY === null ? "Unavailable" : lngYoY >= 5 ? "Expanding" : lngYoY <= -5 ? "Contracting" : "Stable";
  const gasState = storageState === "Below Normal" && lngState === "Expanding"
    ? "Tightening"
    : storageState === "Above Normal" && lngState === "Contracting"
      ? "Loosening"
      : storageState === "Unavailable" && lngState === "Unavailable" ? "Unavailable" : "Balanced";
  return { storageState, lngState, gasState, storagePct, lngYoY };
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

  const { storageState, lngState, gasState } = classifyGasBalance(storagePct, lngYoY);
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

export function buildRrcMacroRisk(metrics: NormalizedMarketMetric[], context: MacroSnapshotContext = {}): RrcMacroRisk {
  const byId = new Map(metrics.map((metric) => [metric.id, metric]));
  const lngMetric = byId.get("lng_exports");
  const henryHubMetric = byId.get("henry_hub");
  const eastStoragePct = context.eastStoragePct ?? null;
  const paProductionYoyPct = context.paProductionYoyPct ?? null;
  const lngExportsYoyPct = lngMetric ? periodChangePct(lngMetric, 12) : null;
  const henryHubThirtyObservationPct = henryHubMetric ? periodChangePct(henryHubMetric, 30) : null;

  const candidates = [
    eastStoragePct !== null && eastStoragePct > 0 ? {
      category: "storage" as const,
      severity: eastStoragePct / 5,
      title: "East storage surplus",
      explanation: `East working gas is ${formatPct(eastStoragePct)} versus its same-week five-year average, signaling a looser regional balance that can pressure Appalachia gas realizations.`,
      supportingMetrics: `East storage vs 5-year average: ${formatPct(eastStoragePct)}`
    } : null,
    paProductionYoyPct !== null && paProductionYoyPct > 0 ? {
      category: "appalachia-supply" as const,
      severity: paProductionYoyPct / 5,
      title: "Appalachia supply growth",
      explanation: `Pennsylvania marketed gas production is ${formatPct(paProductionYoyPct)} year over year, increasing regional supply competition for Range.`,
      supportingMetrics: `PA marketed production YoY: ${formatPct(paProductionYoyPct)}`
    } : null,
    lngExportsYoyPct !== null && lngExportsYoyPct < 0 ? {
      category: "lng-demand" as const,
      severity: Math.abs(lngExportsYoyPct) / 5,
      title: "LNG demand contraction",
      explanation: `U.S. LNG exports are ${formatPct(lngExportsYoyPct)} year over year, reducing a key source of structural natural-gas demand.`,
      supportingMetrics: `LNG exports YoY: ${formatPct(lngExportsYoyPct)}`
    } : null,
    henryHubThirtyObservationPct !== null && henryHubThirtyObservationPct < 0 ? {
      category: "henry-hub" as const,
      severity: Math.abs(henryHubThirtyObservationPct) / 10,
      title: "Weakening Henry Hub momentum",
      explanation: `Henry Hub is ${formatPct(henryHubThirtyObservationPct)} over the latest 30 daily observations, indicating near-term benchmark price pressure.`,
      supportingMetrics: `Henry Hub 30-observation change: ${formatPct(henryHubThirtyObservationPct)}`
    } : null
  ].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  const highestSeverity = candidates.sort((a, b) => b.severity - a.severity)[0];
  if (highestSeverity && highestSeverity.severity >= 1) {
    return { ...highestSeverity, tone: "negative" };
  }

  const availableInputs = [
    eastStoragePct === null ? null : `East storage vs 5-year average: ${formatPct(eastStoragePct)}`,
    paProductionYoyPct === null ? null : `PA marketed production YoY: ${formatPct(paProductionYoyPct)}`,
    lngExportsYoyPct === null ? null : `LNG exports YoY: ${formatPct(lngExportsYoyPct)}`,
    henryHubThirtyObservationPct === null ? null : `Henry Hub 30-observation change: ${formatPct(henryHubThirtyObservationPct)}`
  ].filter((input): input is string => input !== null);

  if (!availableInputs.length) {
    return {
      category: "unavailable",
      tone: "neutral",
      title: "Macro risk unavailable",
      explanation: "Current Macro data does not provide enough supported inputs to identify an RRC-specific adverse signal.",
      supportingMetrics: "No supported risk inputs available"
    };
  }

  return {
    category: "limited",
    tone: "neutral",
    title: "Limited current macro risk",
    explanation: "No monitored adverse signal exceeds its materiality threshold in the latest available Macro data.",
    supportingMetrics: availableInputs.join(" · ")
  };
}

export function formatPct(value: number | null): string {
  return value === null ? "--" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function formatDelta(value: number | null, unit: string): string {
  if (value === null) return "--";
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Math.abs(value));
  return `${value >= 0 ? "+" : "−"}${formatted} ${unit}`;
}

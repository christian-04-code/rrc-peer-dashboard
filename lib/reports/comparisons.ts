import { buildStorageComparison } from "@/lib/market/macro-analytics";
import type { MarketObservation } from "@/lib/market/types";
import type { SteoForecastRevision } from "@/lib/market/macro-steo-types";
import type { Quarter } from "@/lib/dashboard/financials-quarterly";
import { quarters } from "@/lib/dashboard/financials-quarterly";
import type { RigDelta } from "@/lib/rigs/types";
import type { ComparisonDirection, ComparisonPeriod, ComparisonResult } from "@/lib/reports/weekly-report-types";

/**
 * Phase 7B deterministic comparison engine. Every function here is pure --
 * no fetch, no DB call -- and takes already-collected real history/records
 * as input. The governing rule (Phase 7B brief): comparison semantics must
 * follow the underlying data's own period, never the cadence of *report
 * generation*. A weekly cron re-observing the same unchanged monthly
 * production figure two weeks running is not a "WoW production change" --
 * it has no WoW comparison at all, because production isn't a weekly
 * series. Each function below only ever returns the comparison period(s)
 * that are logically valid for its own metric family:
 *   - weekly (EIA storage): WoW, YoY, vs5yrAvg
 *   - daily (Henry Hub spot): WoW only (calendar-anchored, not "5 rows back")
 *   - monthly (production/LNG/demand/Appalachia): MoM, YoY
 *   - quarterly (Range/peer financials): QoQ, YoY (priorQuarterActuals)
 *   - weekly rig counts: WoW, YoY (reusing the import pipeline's own
 *     precomputed deltas -- see compareRigDelta)
 *   - STEO forecast vintages: steoVintage only, and only when a real prior
 *     persisted vintage exists
 * No function here ever fabricates a comparison against a period the data
 * doesn't actually have -- an unavailable prior observation always produces
 * `direction: "unavailable"` with null numeric fields, never an inferred or
 * interpolated one.
 */

function direction(delta: number | null): ComparisonDirection {
  if (delta === null) return "unavailable";
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function deltaPctOf(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function unavailableComparison(period: ComparisonPeriod, metricKey: string, label: string): ComparisonResult {
  return { period, metricKey, label, currentValue: null, previousValue: null, delta: null, deltaPct: null, direction: "unavailable", basisDescription: null };
}

function comparison(
  period: ComparisonPeriod,
  metricKey: string,
  label: string,
  currentValue: number | null,
  previousValue: number | null,
  basisDescription: string | null
): ComparisonResult {
  if (currentValue === null || previousValue === null) return unavailableComparison(period, metricKey, label);
  const delta = currentValue - previousValue;
  return { period, metricKey, label, currentValue, previousValue, delta, deltaPct: deltaPctOf(currentValue, previousValue), direction: direction(delta), basisDescription };
}

// ---------------------------------------------------------------------------
// Weekly (EIA storage)
// ---------------------------------------------------------------------------

/** Reuses lib/market/macro-analytics.ts's buildStorageComparison (Phase 6D/6E) rather than recomputing WoW/YoY/vs-5yr-average logic a second time -- see that function's own header for the ISO-week/5-year-window methodology. */
export function compareStorageWeekly(history: MarketObservation[], metricKey: string, label: string): ComparisonResult[] {
  const built = buildStorageComparison(history);
  const latestPeriod = history[0]?.period ?? null;
  const priorWeekPeriod = history[1]?.period ?? null;
  if (!built || built.latest === null) {
    return [unavailableComparison("WoW", metricKey, label), unavailableComparison("YoY", metricKey, label), unavailableComparison("vs5yrAvg", metricKey, label)];
  }
  return [
    comparison("WoW", metricKey, label, built.latest, built.weeklyChange === null ? null : built.latest - built.weeklyChange, priorWeekPeriod ? `vs. week ending ${priorWeekPeriod}` : null),
    comparison("YoY", metricKey, label, built.latest, built.priorYear, latestPeriod ? `vs. same week one year earlier` : null),
    comparison("vs5yrAvg", metricKey, label, built.latest, built.fiveYearAverage, "vs. trailing 5-year average for this reporting week")
  ];
}

// ---------------------------------------------------------------------------
// Daily (Henry Hub spot)
// ---------------------------------------------------------------------------

function parseIsoDate(period: string): Date | null {
  const parsed = new Date(`${period}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A trading-day series has no observation on weekends/holidays, so "7 calendar days back" is looked up within a small tolerance window rather than requiring an exact match. */
const WOW_TOLERANCE_DAYS = 3;

/** Calendar-date-anchored WoW for a daily series -- deliberately not "index 5/7 back," which silently misaligns across a holiday-shortened trading week. Finds the closest observation 7 calendar days before the latest one, within WOW_TOLERANCE_DAYS; returns unavailable if none falls in that window. */
export function compareDailyWeekly(history: MarketObservation[], metricKey: string, label: string): ComparisonResult[] {
  const latest = history[0];
  const latestDate = latest ? parseIsoDate(latest.period) : null;
  if (!latest || !latestDate) return [unavailableComparison("WoW", metricKey, label)];

  const targetMs = latestDate.getTime() - 7 * DAY_MS;
  let best: MarketObservation | null = null;
  let bestDistance = Infinity;
  for (const point of history.slice(1)) {
    const date = parseIsoDate(point.period);
    if (!date) continue;
    const distance = Math.abs(date.getTime() - targetMs);
    if (distance <= WOW_TOLERANCE_DAYS * DAY_MS && distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  if (!best) return [unavailableComparison("WoW", metricKey, label)];
  return [comparison("WoW", metricKey, label, latest.value, best.value, `vs. ${best.period}`)];
}

// ---------------------------------------------------------------------------
// Monthly (production / LNG / demand / Appalachia)
// ---------------------------------------------------------------------------

/** Calendar-month-anchored lookup, `monthsBack` months before the latest observation's own month, by exact match rather than a fixed array index -- correct even if a month is ever missing, mirroring monthlyYoy's own convention exactly. */
function monthlyPrior(history: MarketObservation[], monthsBack: number): MarketObservation | null {
  const latest = history[0];
  if (!latest || !/^\d{4}-\d{2}$/.test(latest.period)) return null;
  const [year, month] = latest.period.split("-").map(Number);
  const total = year * 12 + (month - 1) - monthsBack;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  const target = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
  return history.find((point) => point.period === target) ?? null;
}

/** MoM + YoY for a monthly EIA series -- never WoW/vs5yrAvg (not logically valid for monthly-cadence data). */
export function compareMonthlySeries(history: MarketObservation[], metricKey: string, label: string): ComparisonResult[] {
  const latest = history[0] ?? null;
  const priorMonth = monthlyPrior(history, 1);
  const priorYear = monthlyPrior(history, 12);
  return [
    comparison("MoM", metricKey, label, latest?.value ?? null, priorMonth?.value ?? null, priorMonth ? `vs. ${priorMonth.period}` : null),
    comparison("YoY", metricKey, label, latest?.value ?? null, priorYear?.value ?? null, priorYear ? `vs. ${priorYear.period}` : null)
  ];
}

// ---------------------------------------------------------------------------
// Quarterly (Range / peer financials)
// ---------------------------------------------------------------------------

/**
 * QoQ + YoY for any quarterly value series exposing a plain `{ value }`
 * shape (SourcedValue, MarketCapValue, EpsValue -- every quarterly fixture
 * in lib/dashboard/ carries a `value: number | null` field, only the extra
 * provenance fields differ), via the fixed `quarters` chronological array.
 * Valid because this project's quarterly fixtures are complete, gap-free
 * Q1 2024-Q2 2026 series (see financials-quarterly.ts's own header); a
 * genuinely missing quarter's own `value` is null, which correctly
 * produces "unavailable" below rather than skipping to the next present
 * quarter.
 */
export function compareQuarterly(
  metricKey: string,
  label: string,
  quarter: Quarter,
  getValue: (quarter: Quarter) => { value: number | null } | undefined
): ComparisonResult[] {
  const index = quarters.indexOf(quarter);
  const current = getValue(quarter)?.value ?? null;
  const priorQuarter = index >= 1 ? quarters[index - 1] : null;
  const yearAgoQuarter = index >= 4 ? quarters[index - 4] : null;
  const priorValue = priorQuarter ? getValue(priorQuarter)?.value ?? null : null;
  const yearAgoValue = yearAgoQuarter ? getValue(yearAgoQuarter)?.value ?? null : null;
  return [
    comparison("QoQ", metricKey, label, current, priorValue, priorQuarter ? `vs. ${priorQuarter}` : null),
    comparison("priorQuarterActuals", metricKey, label, current, yearAgoValue, yearAgoQuarter ? `vs. ${yearAgoQuarter} (year over year)` : null)
  ];
}

// ---------------------------------------------------------------------------
// Weekly rig counts (Baker Hughes import -- deltas already computed upstream)
// ---------------------------------------------------------------------------

/** Reuses the rig-count import pipeline's own precomputed WoW/YoY (RigDelta) rather than recomputing from history -- that pipeline already derives these deltas at import time from the same authoritative weekly workbook; recomputing here would risk a second, potentially-diverging calculation of the same fact. */
export function compareRigDelta(delta: RigDelta, metricKey: string, label: string, reportDate: string | null): ComparisonResult[] {
  const wow: ComparisonResult =
    delta.current === null || delta.wow === null
      ? unavailableComparison("WoW", metricKey, label)
      : { period: "WoW", metricKey, label, currentValue: delta.current, previousValue: delta.priorWeek, delta: delta.wow, deltaPct: delta.wowPct === null ? null : delta.wowPct * 100, direction: direction(delta.wow), basisDescription: "vs. prior published Baker Hughes week" };
  const yoy: ComparisonResult =
    delta.current === null || delta.yoy === null
      ? unavailableComparison("YoY", metricKey, label)
      : { period: "YoY", metricKey, label, currentValue: delta.current, previousValue: delta.yearAgo, delta: delta.yoy, deltaPct: delta.yoyPct === null ? null : delta.yoyPct * 100, direction: direction(delta.yoy), basisDescription: reportDate ? `vs. one year before ${reportDate}` : "vs. one year earlier" };
  return [wow, yoy];
}

// ---------------------------------------------------------------------------
// STEO forecast vintages
// ---------------------------------------------------------------------------

/** One comparison per real forecast-period revision between two persisted STEO snapshots (lib/market/macro-steo.ts's computeForecastRevisions) -- [] when fewer than two vintages have ever been persisted for this series, never a fabricated single-vintage "revision." */
export function compareSteoVintage(revisions: SteoForecastRevision[], metricKey: string, label: string): ComparisonResult[] {
  return revisions.map((revision) => ({
    period: "steoVintage" as const,
    metricKey: `${metricKey}:${revision.period}`,
    label: `${label} (${revision.period})`,
    currentValue: revision.currentValue,
    previousValue: revision.previousValue,
    delta: revision.delta,
    deltaPct: revision.deltaPct,
    direction: direction(revision.delta),
    basisDescription: `${revision.previousSnapshotMonth} vintage vs. ${revision.currentSnapshotMonth} vintage`
  }));
}

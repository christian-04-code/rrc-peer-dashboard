import type { StockHistoryObservation, StockMetrics } from "@/lib/market/stock-detail-types";

const DAY_MS = 86_400_000;
const MAX_ANCHOR_GAP_DAYS = 14;

function asDate(value: string): Date { return new Date(`${value}T00:00:00Z`); }
function shift(date: Date, amount: number, unit: "months" | "years"): Date {
  const result = new Date(date);
  if (unit === "months") result.setUTCMonth(result.getUTCMonth() - amount);
  else result.setUTCFullYear(result.getUTCFullYear() - amount);
  return result;
}

/** Uses the latest trading close on or before the target date, never interpolation. */
export function calculatePeriodReturn(
  observations: StockHistoryObservation[],
  amount: number,
  unit: "months" | "years"
): number | null {
  if (observations.length < 2) return null;
  const latest = observations.at(-1)!;
  const target = shift(asDate(latest.date), amount, unit);
  let anchor: StockHistoryObservation | undefined;
  for (const observation of observations) {
    if (asDate(observation.date) <= target) anchor = observation;
    else break;
  }
  if (!anchor || target.getTime() - asDate(anchor.date).getTime() > MAX_ANCHOR_GAP_DAYS * DAY_MS || anchor.close <= 0) return null;
  return ((latest.close / anchor.close) - 1) * 100;
}

export function calculateYtdReturn(observations: StockHistoryObservation[]): number | null {
  if (observations.length < 2) return null;
  const latest = observations.at(-1)!;
  const target = new Date(Date.UTC(asDate(latest.date).getUTCFullYear(), 0, 1));
  let anchor: StockHistoryObservation | undefined;
  for (const observation of observations) {
    if (asDate(observation.date) <= target) anchor = observation;
    else break;
  }
  if (!anchor || target.getTime() - asDate(anchor.date).getTime() > MAX_ANCHOR_GAP_DAYS * DAY_MS || anchor.close <= 0) return null;
  return ((latest.close / anchor.close) - 1) * 100;
}

function trailing(observations: StockHistoryObservation[], years: number): StockHistoryObservation[] {
  if (!observations.length) return [];
  const cutoff = shift(asDate(observations.at(-1)!.date), years, "years");
  return observations.filter((observation) => asDate(observation.date) >= cutoff);
}

export function movingAverage(observations: StockHistoryObservation[], days: number): number | null {
  if (observations.length < days) return null;
  const values = observations.slice(-days);
  return values.reduce((sum, observation) => sum + observation.close, 0) / days;
}

export function calculateStockMetrics(observations: StockHistoryObservation[], currentPrice: number | null): StockMetrics {
  const oneYear = trailing(observations, 1);
  const fiveYear = trailing(observations, 5);
  const high52 = oneYear.length ? Math.max(...oneYear.map((item) => item.high)) : null;
  const low52 = oneYear.length ? Math.min(...oneYear.map((item) => item.low)) : null;
  const high5y = fiveYear.length ? Math.max(...fiveYear.map((item) => item.high)) : null;
  const low5y = fiveYear.length ? Math.min(...fiveYear.map((item) => item.low)) : null;
  const ma50 = movingAverage(observations, 50);
  const ma200 = movingAverage(observations, 200);
  const averageVolume1y = oneYear.length
    ? Math.round(oneYear.reduce((sum, item) => sum + item.volume, 0) / oneYear.length)
    : null;
  return {
    returns: {
      ytd: calculateYtdReturn(observations),
      sixMonth: calculatePeriodReturn(observations, 6, "months"),
      oneYear: calculatePeriodReturn(observations, 1, "years"),
      threeYear: calculatePeriodReturn(observations, 3, "years"),
      fiveYear: calculatePeriodReturn(observations, 5, "years")
    },
    fiftyTwoWeekHigh: high52,
    fiftyTwoWeekLow: low52,
    fiveYearHigh: high5y,
    fiveYearLow: low5y,
    movingAverage50: ma50,
    movingAverage200: ma200,
    currentVsMovingAverage200: currentPrice !== null && ma200 !== null ? ((currentPrice / ma200) - 1) * 100 : null,
    distanceFrom52WeekHigh: currentPrice !== null && high52 !== null ? ((currentPrice / high52) - 1) * 100 : null,
    distanceFrom52WeekLow: currentPrice !== null && low52 !== null ? ((currentPrice / low52) - 1) * 100 : null,
    averageVolume1y
  };
}

export function findPreviousHistoricalClose(observations: StockHistoryObservation[], quoteTimestamp: number | null): number | null {
  if (!observations.length) return null;
  if (!quoteTimestamp) return observations.at(-1)!.close;
  const quoteDate = new Date(quoteTimestamp * 1000).toISOString().slice(0, 10);
  return [...observations].reverse().find((observation) => observation.date < quoteDate)?.close ?? observations.at(-1)!.close;
}

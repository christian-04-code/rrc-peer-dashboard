import { runRrcValuedScenario, defaultRrcValuationAssumptions } from "@/lib/forecast/scenarios/rrc-valued";
import type { RrcCurrentMarketPrices } from "@/lib/forecast/scenarios/rrc-complete";
import type { Ticker } from "./company-registry";

export type ForecastChartMetric = "revenue" | "ebitdax" | "fcf";
export type ForecastChartPoint = { period: string; value: number | null };

const FORECAST_SUPPORTED_TICKERS: ReadonlySet<Ticker> = new Set(["RRC"]);

/** The forecast engine currently only supports RRC. Peer tickers must never be given a fabricated forecast. */
export function isForecastChartSupported(ticker: Ticker): boolean {
  return FORECAST_SUPPORTED_TICKERS.has(ticker);
}

// "2026Q2" -> "Q2 2026", matching the axis label style already used for reported quarters.
export function forecastQuarterLabel(period: string): string {
  return `${period.slice(4)} ${period.slice(0, 4)}`;
}

// 2026Q1 is excluded: it's the latest reported actual quarter, already covered by
// financials-quarterly.ts, and must never be overwritten by a modeled value.
export const FORECAST_CHART_PERIODS: string[] = [2026, 2027, 2028]
  .flatMap((year) => [1, 2, 3, 4].map((quarter) => `${year}Q${quarter}`))
  .filter((period) => period !== "2026Q1");

/**
 * Modeled Revenue/EBITDAX/FCF for the forecast/live portion of the main chart, driven by
 * the existing deterministic RRC forecast engine and (optionally) current commodity-price
 * inputs. Reuses runRrcValuedScenario as-is -- no second revenue/EBITDAX/FCF formula;
 * freeCashFlowMillion is the same per-period quarterly value the engine already computes
 * (lib/forecast/engine.ts), not an annual figure allocated across quarters.
 * Returns [] for any ticker the forecast engine doesn't support.
 */
export function buildForecastChartSeries(
  ticker: Ticker,
  metric: ForecastChartMetric,
  currentMarketPrices?: RrcCurrentMarketPrices
): ForecastChartPoint[] {
  if (!isForecastChartSupported(ticker)) return [];

  const { complete } = runRrcValuedScenario("maintenance", defaultRrcValuationAssumptions, { currentMarketPrices });
  const byPeriod = new Map(complete.forecast.periods.map((period) => [period.period, period]));

  return FORECAST_CHART_PERIODS.map((period) => {
    const row = byPeriod.get(period);
    const value = !row
      ? null
      : metric === "revenue"
        ? row.revenue.totalMillion
        : metric === "ebitdax"
          ? row.ebitdaxMillion
          : row.freeCashFlowMillion;
    return { period: forecastQuarterLabel(period), value };
  });
}

export type ParsedQuarter = { year: number; quarter: 1 | 2 | 3 | 4 };

export function parseQuarter(period: string): ParsedQuarter {
  const match = /^(\d{4})Q([1-4])$/.exec(period);
  if (!match) throw new Error(`Invalid quarterly period: ${period}`);
  return { year: Number(match[1]), quarter: Number(match[2]) as ParsedQuarter["quarter"] };
}

/** Three display/valuation years, anchored to the year containing the latest actual. */
export function buildForecastYearWindow(latestActualPeriod: string, count = 3): string[] {
  if (!Number.isInteger(count) || count < 1) throw new Error("Forecast year count must be a positive integer.");
  const { year, quarter } = parseQuarter(latestActualPeriod);
  const firstForecastYear = quarter === 4 ? year + 1 : year;
  return Array.from({ length: count }, (_, index) => String(firstForecastYear + index));
}

export function formatQuarter(period: string): string {
  const { year, quarter } = parseQuarter(period);
  return `Q${quarter} ${year}`;
}

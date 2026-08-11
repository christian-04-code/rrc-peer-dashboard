/**
 * Structured, numeric management guidance -- the reference layer described in the
 * Forecast product spec. Sourced from data/management-guidance.json via
 * lib/dashboard/guidance.ts's getCompanyGuidanceRecords (the same canonical,
 * reporting-cycle-filtered dataset the Overview GuidancePanel renders as display
 * strings): each entry here is a single metric with an explicit low/high/midpoint,
 * period, and source citation, so it can both render as a reference card and feed a
 * forecast default. A company that only guides a single point value (e.g. "~2.6 Bcfe/d")
 * stores it as low = high = null, midpoint = the point value -- midpoint is never
 * invented from a single point by pretending a range exists.
 */

export type GuidanceMetricKey =
  | "totalProductionBcfePerDay"
  | "capexTotalMillion"
  | "loePerMcfe"
  | "gatheringTransportPerMcfe"
  | "cashGaPerMcfe"
  | "cashInterestPerMcfe"
  | "explorationMillion"
  | "cashTaxRate"
  | "gasBasisPerMcf"
  | "oilDifferentialPerBbl"
  | "nglDifferentialPerBbl"
  | "productionTaxPerMcfe";

export type GuidanceYear = "2026" | "2027" | "2028";

export type GuidanceEntry = {
  metric: GuidanceMetricKey;
  label: string;
  year: GuidanceYear;
  unit: string;
  low: number | null;
  high: number | null;
  /** (low + high) / 2 when a range was given; equal to the single value when management gave a point estimate. */
  midpoint: number | null;
  sourceName: string;
  sourceReference: string;
  sourceDate: string;
  notes?: string;
};

export function rangeMidpoint(low: number | null, high: number | null): number | null {
  if (low === null || high === null) return null;
  // Round to 10 decimal places to drop binary floating-point noise (e.g. (0.14+0.16)/2
  // producing 0.15000000000000002) without meaningfully truncating any real guidance figure.
  return Math.round(((low + high) / 2) * 1e10) / 1e10;
}

export function findGuidance(
  entries: GuidanceEntry[],
  metric: GuidanceMetricKey,
  year: GuidanceYear
): GuidanceEntry | undefined {
  return entries.find((entry) => entry.metric === metric && entry.year === year);
}

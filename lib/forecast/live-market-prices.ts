import type { RrcCurrentMarketPrices } from "@/lib/forecast/scenarios/rrc-complete";
import type { SourcedValue } from "@/lib/forecast/types";

export type LiveMarketMetric = {
  value: number | null;
  period?: string | null;
  fetchedAt?: string | null;
  source?: string | null;
} | null | undefined;

export type LiveMarketPricesInput = {
  henryHub?: LiveMarketMetric;
  wti?: LiveMarketMetric;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toLiveSourcedValue(metric: LiveMarketMetric, unit: string, label: string): SourcedValue | undefined {
  if (!metric || !isFiniteNumber(metric.value)) return undefined;
  return {
    value: metric.value,
    unit,
    source: {
      name: metric.source ?? "U.S. EIA",
      reference: label,
      period: metric.period ?? "current",
      retrievedAt: metric.fetchedAt ?? new Date().toISOString(),
      classification: "live",
      notes: "Live EIA spot price supplied by the dashboard Forecast tab, replacing the modeled sensitivity assumption for this run."
    }
  };
}

/**
 * Converts raw live market metrics (as returned by /api/market) into the
 * scenario engine's currentMarketPrices override. A commodity is omitted
 * (undefined) whenever its live value is missing or non-numeric, so the
 * existing `?? modeled default` fallback in rrc-complete.ts applies —
 * never a fabricated or zeroed price.
 */
export function buildCurrentMarketPrices(input: LiveMarketPricesInput): RrcCurrentMarketPrices {
  return {
    henryHubPerMmbtu: toLiveSourcedValue(input.henryHub, "$/MMBtu", "Henry Hub"),
    wtiPerBbl: toLiveSourcedValue(input.wti, "$/bbl", "WTI")
  };
}

"use client";

import { useMarketData } from "@/lib/market/use-market-data";
import type { NormalizedMarketMetric } from "@/lib/market/types";

const RIBBON_IDS = new Set(["henry_hub", "wti", "brent"]);

function formatValue(metric: NormalizedMarketMetric): string {
  if (metric.status !== "ok" || metric.value === null) return "--";
  if (metric.id === "storage" || metric.id === "lng_exports") {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(metric.value);
  }
  return metric.value.toFixed(2);
}

export function MarketRibbon({ onOpen }: { onOpen: (value: string) => void }) {
  const { data, loading, error } = useMarketData();
  const metrics = data?.metrics.filter((metric) => RIBBON_IDS.has(metric.id)) ?? [];

  return (
    <section className="market-ribbon" aria-label="Delayed energy market data">
      {loading
        ? ["Henry Hub", "WTI", "Brent"].map((label) => (
            <button key={label} disabled>
              <span>{label}</span><strong>--</strong><em>Loading</em>
            </button>
          ))
        : metrics.length > 0
          ? metrics.map((metric) => (
              <button
                key={metric.id}
                onClick={() =>
                  onOpen(
                    `${metric.label}: ${formatValue(metric)} ${metric.unit}. Period: ${metric.period ?? "--"}. Source: ${metric.source}. Classification: ${metric.classification}. Fetched: ${metric.fetchedAt}.${metric.error ? ` Error: ${metric.error}` : ""}`
                  )
                }
              >
                <span>{metric.label}</span>
                <strong>{formatValue(metric)}</strong>
                <em>{metric.status === "ok" ? metric.unit : "Unavailable"}</em>
              </button>
            ))
          : ["Henry Hub", "WTI", "Brent"].map((label) => (
              <button key={label} onClick={() => onOpen(error ?? "Market data unavailable")}>
                <span>{label}</span><strong>--</strong><em>Unavailable</em>
              </button>
            ))}
    </section>
  );
}

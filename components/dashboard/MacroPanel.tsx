"use client";

import { useMarketData } from "@/lib/market/use-market-data";
import type { NormalizedMarketMetric } from "@/lib/market/types";

const MARKET_IDS = ["henry_hub", "wti", "brent"];
const DETAIL_IDS = ["storage", "lng_exports"];

function formatMetric(metric: NormalizedMarketMetric | undefined): string {
  if (!metric || metric.status !== "ok" || metric.value === null) return "--";
  const maximumFractionDigits = metric.id === "storage" || metric.id === "lng_exports" ? 0 : 2;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(metric.value);
}

function MarketCard({ metric, label }: { metric?: NormalizedMarketMetric; label: string }) {
  return (
    <div className="macro-market-card">
      <span>{metric?.label ?? label}</span>
      <strong>{formatMetric(metric)}</strong>
      <em>{metric?.status === "ok" ? metric.unit : "Unavailable"}</em>
      <small>{metric?.period ?? "--"} · {metric?.source ?? "U.S. EIA"}</small>
    </div>
  );
}

export function MacroPanel() {
  const { data, loading, error } = useMarketData();
  const byId = new Map(data?.metrics.map((metric) => [metric.id, metric]) ?? []);

  return (
    <div className="macro-panel">
      <div className="macro-market">
        <h2>Market context</h2>
        <div className="macro-market-grid">
          {MARKET_IDS.map((id) => (
            <MarketCard
              key={id}
              metric={byId.get(id)}
              label={id === "henry_hub" ? "Henry Hub" : id === "wti" ? "WTI" : "Brent"}
            />
          ))}
        </div>
      </div>

      <div className="macro-market">
        <h2>Natural gas fundamentals</h2>
        <div className="macro-market-grid">
          {DETAIL_IDS.map((id) => (
            <MarketCard
              key={id}
              metric={byId.get(id)}
              label={id === "storage" ? "Lower 48 Storage" : "U.S. LNG Exports"}
            />
          ))}
        </div>
      </div>

      <div className="macro-section">
        <h2>Feed status</h2>
        <p className="muted">
          {loading
            ? "Loading normalized EIA feeds…"
            : error
              ? `Market API unavailable: ${error}`
              : `Updated ${data?.generatedAt ?? "--"}. Unsupported values render -- and are never replaced with estimates.`}
        </p>
      </div>
    </div>
  );
}

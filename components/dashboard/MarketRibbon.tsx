"use client";

import { useMarketData } from "@/lib/market/use-market-data";
import type { CurrentMarketCommodityQuote, MarketApiResponse, NormalizedMarketMetric } from "@/lib/market/types";

const RIBBON_IDS = new Set(["henry_hub", "wti", "brent"]);
const RIBBON_LABELS: Record<string, string> = { henry_hub: "Henry Hub", wti: "WTI", brent: "Brent" };

function formatValue(metric: NormalizedMarketMetric): string {
  if (metric.status !== "ok" || metric.value === null) return "--";
  if (metric.id === "storage" || metric.id === "lng_exports") {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(metric.value);
  }
  return metric.value.toFixed(2);
}

function formatChange(current: CurrentMarketCommodityQuote): string | null {
  if (current.change24hPercent === null) return null;
  const sign = current.change24hPercent >= 0 ? "+" : "";
  return `${sign}${current.change24hPercent.toFixed(2)}% 24h`;
}

type RibbonItem = {
  key: string;
  label: string;
  displayValue: string;
  statusText: string;
  changeText: string | null;
  onOpenText: string;
};

/**
 * WTI/Henry Hub prioritize OilPriceAPI's current-market quote when it's ok (not
 * stale/synthetic/missing); EIA's latest-official reading is the fallback and stays
 * reachable via the detail drawer either way, never silently relabeled as current.
 * Brent is untouched -- EIA only, exactly as before.
 */
function buildRibbonItems(data: MarketApiResponse | null): RibbonItem[] {
  if (!data) return [];
  const eiaById = new Map(data.metrics.map((metric) => [metric.id, metric]));
  const items: RibbonItem[] = [];

  for (const [id, current] of [
    ["wti", data.currentMarket.wti],
    ["henry_hub", data.currentMarket.henryHub]
  ] as const) {
    const eia = eiaById.get(id);
    const label = RIBBON_LABELS[id];
    const eiaDetail = eia
      ? ` EIA latest official: ${formatValue(eia)} ${eia.unit} (period ${eia.period ?? "--"}, ${eia.classification}).`
      : "";

    if (current.status === "ok" && current.price !== null) {
      items.push({
        key: id,
        label,
        displayValue: current.price.toFixed(2),
        statusText: current.unit ?? "",
        changeText: formatChange(current),
        onOpenText: `${label}: ${current.price.toFixed(2)} ${current.unit ?? ""}. Source: OilPriceAPI · Current Market. As of: ${current.asOf ?? "--"}. Data status: ${current.dataStatus ?? "--"}.${eiaDetail}`
      });
    } else if (eia) {
      items.push({
        key: id,
        label,
        displayValue: formatValue(eia),
        statusText: eia.status === "ok" ? eia.unit : "Unavailable",
        changeText: null,
        onOpenText: `${label}: ${formatValue(eia)} ${eia.unit}. Period: ${eia.period ?? "--"}. Source: ${eia.source}. Classification: EIA · Latest Official.${
          current.error ? ` OilPriceAPI current-market: unavailable (${current.error}).` : ""
        }`
      });
    } else {
      items.push({ key: id, label, displayValue: "--", statusText: "Unavailable", changeText: null, onOpenText: `${label} unavailable.` });
    }
  }

  const brent = eiaById.get("brent");
  if (brent) {
    items.push({
      key: "brent",
      label: "Brent",
      displayValue: formatValue(brent),
      statusText: brent.status === "ok" ? brent.unit : "Unavailable",
      changeText: null,
      onOpenText: `Brent: ${formatValue(brent)} ${brent.unit}. Period: ${brent.period ?? "--"}. Source: ${brent.source}. Classification: EIA · Latest Official.`
    });
  }

  return items;
}

export function MarketRibbon({ onOpen }: { onOpen: (value: string) => void }) {
  const { data, loading, error } = useMarketData();
  const items = buildRibbonItems(data).filter((item) => RIBBON_IDS.has(item.key));

  return (
    <section className="market-ribbon" aria-label="Energy market data: current market where available, otherwise latest official/delayed">
      {loading
        ? ["Henry Hub", "WTI", "Brent"].map((label) => (
            <button key={label} disabled>
              <span>{label}</span><strong>--</strong><em>Loading</em>
            </button>
          ))
        : items.length > 0
          ? items.map((item) => (
              <button key={item.key} onClick={() => onOpen(item.onOpenText)}>
                <span>{item.label}</span>
                <strong>{item.displayValue}</strong>
                <em>{item.statusText}</em>
                {item.changeText ? <small>{item.changeText}</small> : null}
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

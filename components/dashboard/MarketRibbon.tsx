"use client";

import { useMarketData } from "@/lib/market/use-market-data";
import type { CurrentMarketCommodityQuote, MarketApiResponse, NormalizedMarketMetric } from "@/lib/market/types";

function formatValue(metric: NormalizedMarketMetric): string {
  if (metric.status !== "ok" || metric.value === null) return "--";
  return metric.value.toFixed(2);
}

function currentChange(quote: CurrentMarketCommodityQuote): string | null {
  if (quote.change24hPercent === null) return null;
  return `${quote.change24hPercent >= 0 ? "+" : ""}${quote.change24hPercent.toFixed(2)}% 24h`;
}

type RibbonItem = { key: string; label: string; value: string; unit: string; change: string | null; detail: string };

function buildRibbonItems(data: MarketApiResponse | null): RibbonItem[] {
  if (!data) return [];
  const eia = new Map(data.metrics.map((metric) => [metric.id, metric]));
  const items: RibbonItem[] = [];
  for (const [id, quote] of [["henry_hub", data.currentMarket.henryHub], ["wti", data.currentMarket.wti]] as const) {
    const official = eia.get(id);
    if (quote.status === "ok" && quote.price !== null) {
      items.push({
        key: id, label: quote.label, value: quote.price.toFixed(2), unit: quote.unit ?? "",
        change: currentChange(quote),
        detail: `${quote.label}: ${quote.price.toFixed(2)} ${quote.unit ?? ""}. OilPriceAPI · Current Market · as of ${quote.asOf ?? "--"}.${official ? ` EIA latest official: ${formatValue(official)} ${official.unit}, ${official.period ?? "--"}.` : ""}`
      });
    } else if (official) {
      items.push({ key: id, label: official.label, value: formatValue(official), unit: official.status === "ok" ? official.unit : "Unavailable", change: null, detail: `${official.label}: ${formatValue(official)} ${official.unit}. EIA · Latest Official · ${official.period ?? "--"}.${quote.error ? ` Current market unavailable: ${quote.error}` : ""}` });
    }
  }
  const brent = eia.get("brent");
  if (brent) items.push({ key: "brent", label: brent.label, value: formatValue(brent), unit: brent.status === "ok" ? brent.unit : "Unavailable", change: null, detail: `Brent: ${formatValue(brent)} ${brent.unit}. EIA · Latest Official · ${brent.period ?? "--"}.` });
  return items;
}

export function MarketRibbon({ onOpen }: { onOpen: (value: string) => void }) {
  const { data, loading, error } = useMarketData();
  const items = buildRibbonItems(data);
  return (
    <section className="market-ribbon" aria-label="Energy market data: current market where available, otherwise latest official">
      {loading ? ["Henry Hub", "WTI", "Brent"].map((label) => <button key={label} disabled><span>{label}</span><strong>--</strong><em>Loading</em></button>)
        : items.length ? items.map((item) => <button key={item.key} onClick={() => onOpen(item.detail)}><span>{item.label}</span><strong>{item.value}</strong><em>{item.unit}</em>{item.change ? <small>{item.change}</small> : null}</button>)
          : ["Henry Hub", "WTI", "Brent"].map((label) => <button key={label} onClick={() => onOpen(error ?? "Market data unavailable")}><span>{label}</span><strong>--</strong><em>Unavailable</em></button>)}
    </section>
  );
}

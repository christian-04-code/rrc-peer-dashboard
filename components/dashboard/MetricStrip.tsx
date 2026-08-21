import type { SummaryCard } from "@/lib/dashboard/overview-metrics";
import type { Ticker } from "@/lib/dashboard/company-registry";
import { StockDetailButton } from "@/components/dashboard/StockDetailButton";

export function MetricStrip({ metrics, companyShortName, ticker }: { metrics: SummaryCard[]; companyShortName: string; ticker: Ticker }) {
  return (
    <section className="metric-grid" aria-label={`${companyShortName} key metrics`}>
      {metrics.map((item) => (
        <div className="metric" key={item.key} title={item.definition}>
          <div className="metric-rank"><span>Rank</span><b>{item.rank === null ? "--" : `#${item.rank}`}</b></div>
          <span>{item.label}</span><strong>{item.displayValue}</strong><small>{item.note}</small>
          {item.key === "share_price" && <StockDetailButton ticker={ticker} />}
        </div>
      ))}
    </section>
  );
}

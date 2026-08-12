import type { SummaryCard } from "@/lib/dashboard/overview-metrics";

export function MetricStrip({ metrics, companyShortName }: { metrics: SummaryCard[]; companyShortName: string }) {
  return (
    <section className="metric-grid" aria-label={`${companyShortName} key metrics`}>
      {metrics.map((item) => (
        <div className="metric" key={item.key}>
          <div className="metric-rank"><span>Rank</span><b>{item.rank === null ? "--" : `#${item.rank}`}</b></div>
          <span>{item.label}</span><strong>{item.displayValue}</strong><small>{item.note}</small>
        </div>
      ))}
    </section>
  );
}

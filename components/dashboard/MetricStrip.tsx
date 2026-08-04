import type { DisplayMetric } from "@/lib/dashboard/homepage-data";
import type { Metric } from "@/lib/dashboard/types";

function metricIndex(metric: Metric) { return ({ production: 1, fcf: 2, capex: 3, debt: 4, valuation: 0 })[metric]; }
function metricFromIndex(index: number): Metric { return (["valuation", "production", "fcf", "capex", "debt"] as Metric[])[index] ?? "production"; }

export function MetricStrip({
  metrics,
  activeMetric,
  onSelectMetric,
  companyShortName
}: {
  metrics: DisplayMetric[];
  activeMetric: Metric;
  onSelectMetric: (metric: Metric) => void;
  companyShortName: string;
}) {
  return (
    <section className="metric-grid" aria-label={`${companyShortName} key metrics`}>
      {metrics.map((item, index) => (
        <button key={item.key} className={index === metricIndex(activeMetric) ? "metric active" : "metric"} onClick={() => onSelectMetric(metricFromIndex(index))}>
          <span>{item.label}</span><strong>{item.displayValue}</strong><small>{item.note}</small>
        </button>
      ))}
    </section>
  );
}

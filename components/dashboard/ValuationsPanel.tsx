import { getValuationSnapshot, type ValuationMetric, type ValuationUnit } from "@/lib/dashboard/valuations";
import type { Ticker } from "@/lib/dashboard/types";

function formatValue(unit: ValuationUnit, value: number | null): string {
  if (value === null) return "--";
  if (unit === "$/share") return `$${value.toFixed(2)}`;
  if (unit === "x") return `${value.toFixed(1)}x`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}MM`;
}

export function ValuationsPanel({ ticker }: { ticker: Ticker }) {
  const metrics = getValuationSnapshot(ticker);
  const latestQuarter = metrics[0]?.currentPeriod;
  const priorYearQuarter = metrics[0]?.previousPeriod;

  return (
    <div className="panel financials-panel valuations-panel">
      <div className="panel-head">
        <h2>Valuations</h2>
        <span className="badge">{latestQuarter}</span>
      </div>

      <div className="financials-section">
        <ul>
          {metrics.map((metric: ValuationMetric) => (
            <li key={metric.key}>
              <span>{metric.label}</span>
              <span className="financials-values">
                <strong>{formatValue(metric.unit, metric.current)}</strong>
                <small>{metric.previousPeriod}: {formatValue(metric.unit, metric.previous)}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="muted panel-note">
        Latest reported ({latestQuarter}) vs. prior-year quarter ({priorYearQuarter}). P/E uses quarter-end market cap and trailing-twelve-month net income; other metrics are standalone-quarter or quarter-end values. Unsupported metrics display &quot;--&quot;.
      </p>
    </div>
  );
}

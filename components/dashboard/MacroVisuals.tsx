import type { DemandMetric, RegionalStorageMetric, StateProductionMetric } from "@/lib/market/macro-types";
import type { MarketObservation } from "@/lib/market/types";
import { formatPct } from "@/lib/market/macro-analytics";

export type ChartSeries = {
  id: string;
  label: string;
  color: string;
  history: MarketObservation[];
  /** Renders this series dashed with a "(forecast)" legend suffix -- the interactive actual-vs-forecast distinction, never conflating a projection with an observed value visually. */
  forecast?: boolean;
};

function formatAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

export function HistoricalLineChart({ series, unit, limit = 60, ariaLabel }: { series: ChartSeries[]; unit: string; limit?: number; ariaLabel: string }) {
  const visible = series.map((item) => ({ ...item, history: item.history.slice(0, limit).reverse() })).filter((item) => item.history.length > 1);
  const values = visible.flatMap((item) => item.history.map((point) => point.value));
  if (values.length < 2) return <div className="macro-chart-empty">--<small>No supported observations</small></div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min || Math.abs(max) || 1) * .08;
  const chartMin = min - padding;
  const chartMax = max + padding;
  const y = (value: number) => 190 - ((value - chartMin) / (chartMax - chartMin)) * 155;
  const latestPeriods = visible.flatMap((item) => item.history.map((point) => point.period)).sort();

  return (
    <div className="macro-evidence-chart">
      <svg viewBox="0 0 660 220" role="img" aria-label={ariaLabel}>
        {[35, 112.5, 190].map((lineY) => <line className="macro-chart-grid" key={lineY} x1="52" x2="648" y1={lineY} y2={lineY} />)}
        <text x="45" y="39" textAnchor="end">{formatAxis(chartMax)}</text>
        <text x="45" y="116" textAnchor="end">{formatAxis((chartMax + chartMin) / 2)}</text>
        <text x="45" y="194" textAnchor="end">{formatAxis(chartMin)}</text>
        <text className="macro-axis-unit" x="52" y="16">{unit}</text>
        {visible.map((item) => {
          const path = item.history.map((point, index) => {
            const x = 52 + (index / (item.history.length - 1)) * 596;
            return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y(point.value).toFixed(1)}`;
          }).join(" ");
          return (
            <g key={item.id}>
              <path className="macro-series-line" d={path} style={{ stroke: item.color, strokeDasharray: item.forecast ? "4 3" : undefined }} />
              {item.history.map((point, index) => {
                const x = 52 + (index / (item.history.length - 1)) * 596;
                return <circle key={`${item.id}-${point.period}`} cx={x} cy={y(point.value)} r={index === item.history.length - 1 ? 3.5 : 1.8} fill={item.color}><title>{item.label}{item.forecast ? " (EIA STEO forecast)" : ""} · {point.period}: {new Intl.NumberFormat("en-US").format(point.value)} {unit}</title></circle>;
              })}
            </g>
          );
        })}
      </svg>
      <div className="macro-chart-axis"><span>{latestPeriods[0]}</span><span>{latestPeriods[latestPeriods.length - 1]}</span></div>
      <div className="macro-series-legend">{visible.map((item) => <span key={item.id}><i className={item.forecast ? "forecast" : ""} style={{ background: item.forecast ? "transparent" : item.color, borderColor: item.color }} />{item.label}{item.forecast ? " (forecast)" : ""}</span>)}</div>
    </div>
  );
}

export function RegionalStorageTable({ regions }: { regions: RegionalStorageMetric[] }) {
  const maxDeviation = Math.max(10, ...regions.map((region) => Math.abs(region.fiveYearPct ?? 0)));
  return (
    <div className="macro-regional-table" role="table" aria-label="Regional storage comparison">
      <div className="macro-regional-row header" role="row"><span>Region</span><span>Current</span><span>Prior wk</span><span>Weekly Δ</span><span>Year ago</span><span>vs YA</span><span>5Y avg</span><span>vs 5Y</span><span>Deviation</span></div>
      {regions.map((region) => {
        const deviation = region.fiveYearPct;
        const width = deviation === null ? 0 : Math.min(50, (Math.abs(deviation) / maxDeviation) * 50);
        return (
          <div className="macro-regional-row" role="row" key={region.id}>
            <strong>{region.label}</strong>
            <span>{region.current === null ? "--" : `${region.current.toFixed(0)} Bcf`}</span>
            <span>{region.priorWeek === null ? "--" : `${region.priorWeek.toFixed(0)} Bcf`}</span>
            <span>{region.weeklyChange === null ? "--" : `${region.weeklyChange >= 0 ? "+" : ""}${region.weeklyChange.toFixed(0)}`}</span>
            <span>{region.yearAgo === null ? "--" : `${region.yearAgo.toFixed(0)} Bcf`}</span>
            <span>{formatPct(region.yearAgoPct)}</span>
            <span>{region.fiveYearAverage === null ? "--" : `${region.fiveYearAverage.toFixed(0)} Bcf`}</span>
            <span>{formatPct(deviation)}</span>
            <div className="macro-deviation-bar"><i className={deviation !== null && deviation < 0 ? "below" : "above"} style={{ width: `${width}%`, marginLeft: deviation !== null && deviation < 0 ? `${50 - width}%` : "50%" }} /></div>
          </div>
        );
      })}
    </div>
  );
}

export function StateProductionRanking({ states }: { states: StateProductionMetric[] }) {
  const ranked = states.slice().sort((a, b) => b.current - a.current).slice(0, 8);
  const max = ranked[0]?.current ?? 0;
  if (!ranked.length) return <div className="macro-chart-empty">--<small>State production unavailable</small></div>;
  return (
    <div className="macro-ranking" aria-label="Top producing states by returned EIA marketed production">
      {ranked.map((state, index) => (
        <div key={state.stateCode} className={state.stateCode === "PA" ? "macro-ranking-row rrc" : "macro-ranking-row"}>
          <span>{index + 1}</span><strong>{state.stateCode}</strong>
          <div><i style={{ width: `${max ? (state.current / max) * 100 : 0}%` }} /></div>
          <b>{formatAxis(state.current)}</b><small>{formatPct(state.yearOverYearPct)} YoY</small>
        </div>
      ))}
      <small>Dynamic ranking from latest returned monthly observations; values in MMcf/month.</small>
    </div>
  );
}

export function DemandChart({ demand }: { demand: DemandMetric[] }) {
  return <HistoricalLineChart
    ariaLabel="U.S. natural gas demand by end use"
    unit="MMcf/month"
    limit={48}
    series={demand.map((item, index) => ({
      id: item.id,
      label: item.label,
      history: item.history,
      color: ["#3db3e3", "#70c99a", "#e5ad63", "#b68ad8"][index]
    }))}
  />;
}

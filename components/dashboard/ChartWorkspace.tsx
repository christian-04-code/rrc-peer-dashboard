import { Fragment } from "react";
import { getAllQuartersForTicker, quarters, type QuarterlyFinancials } from "@/lib/dashboard/financials-quarterly";
import type { Metric, Ticker } from "@/lib/dashboard/types";

const WIDTH = 760;
const HEIGHT = 300;
const LEFT = 62;
const RIGHT = 28;
const TOP = 40;
const BOTTOM = 48;

const metricConfig: Record<Metric, {
  label: string;
  unit: string;
  value: (row: QuarterlyFinancials) => number | null;
  comparable: boolean;
  caveat?: string;
}> = {
  production: {
    label: "Production",
    unit: "MMcfe/d",
    value: (row) => row.production.total.value,
    comparable: true
  },
  capex: {
    label: "Capital expenditures",
    unit: "$MM",
    value: (row) => row.capitalExpenditures.value,
    comparable: true,
    caveat: "Capital expenditure definitions vary by company. RRC and AR are accrual-adjusted total capital spending; other peers use company-reported figures."
  },
  debt: {
    label: "Net debt",
    unit: "$MM",
    value: (row) => row.netDebt.value,
    comparable: true
  },
  fcf: {
    label: "Free cash flow",
    unit: "$MM",
    value: () => null,
    comparable: false,
    caveat: "Quarterly free cash flow has not yet been loaded into the normalized peer dataset. Unsupported values remain blank rather than being estimated."
  },
  valuation: {
    label: "Valuation",
    unit: "x",
    value: () => null,
    comparable: false,
    caveat: "Historical valuation multiples have not yet been loaded into the normalized peer dataset. Unsupported values remain blank rather than being estimated."
  }
};

type Series = {
  ticker: Ticker;
  values: Array<number | null>;
};

export function ChartWorkspace({
  ticker,
  comparisonTickers,
  title,
  metric
}: {
  ticker: Ticker;
  comparisonTickers: Ticker[];
  title: string;
  metric: Metric;
}) {
  const config = metricConfig[metric];
  const tickers = [ticker, ...comparisonTickers.filter((peer) => peer !== ticker)];
  const series: Series[] = tickers.map((seriesTicker) => ({
    ticker: seriesTicker,
    values: getAllQuartersForTicker(seriesTicker).map(config.value)
  }));
  const numericValues = series.flatMap((item) => item.values.filter((value): value is number => value !== null));

  if (!config.comparable || numericValues.length === 0) {
    return (
      <div className="chart-area chart-empty-state">
        <div>
          <h2>{title}</h2>
          <p>{config.caveat}</p>
        </div>
        <div className="empty-chart-message" role="status">No verified peer series available</div>
      </div>
    );
  }

  const rawMin = Math.min(...numericValues);
  const rawMax = Math.max(...numericValues);
  const spread = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.08, 1);
  const min = rawMin - spread * 0.12;
  const max = rawMax + spread * 0.12;
  const yTicks = Array.from({ length: 4 }, (_, index) => max - ((max - min) * index) / 3);

  const xFor = (index: number) => LEFT + (index * (WIDTH - LEFT - RIGHT)) / Math.max(quarters.length - 1, 1);
  const yFor = (value: number) => TOP + ((max - value) * (HEIGHT - TOP - BOTTOM)) / (max - min);

  return (
    <div className="chart-area">
      <div>
        <h2>{title}</h2>
        <p>Verified standalone quarterly actuals · Q1 2024 through Q1 2026 · blanks are not estimated</p>
        {config.caveat ? <p className="muted">{config.caveat}</p> : null}
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${config.label} comparison for ${tickers.join(", ")} from Q1 2024 through Q1 2026.`}>
        <g className="grid-lines">
          {yTicks.map((value) => {
            const y = yFor(value);
            return <line key={value} x1={LEFT} y1={y} x2={WIDTH - RIGHT} y2={y} />;
          })}
        </g>
        <g className="axis-labels">
          <text className="axis-unit" x="12" y="24">{config.unit}</text>
          {yTicks.map((value) => (
            <text key={value} className="y-axis-label" x={LEFT - 8} y={yFor(value) + 4}>{formatAxis(value)}</text>
          ))}
          {quarters.map((quarter, index) => (
            index % 2 === 0 || index === quarters.length - 1
              ? <text key={quarter} className="x-axis-label" x={xFor(index)} y={HEIGHT - 20} textAnchor="middle">{quarter.replace(" ", "'")}</text>
              : null
          ))}
        </g>
        {series.map((item, seriesIndex) => (
          <Fragment key={item.ticker}>
            {buildPathSegments(item.values, xFor, yFor).map((path, segmentIndex) => (
              <path
                key={`${item.ticker}-${segmentIndex}`}
                className={seriesIndex === 0 ? "primary-line" : `peer-line peer-${Math.min(seriesIndex, 6)}`}
                d={path}
                fill="none"
              />
            ))}
            {item.values.map((value, index) => value === null ? null : (
              <circle
                key={`${item.ticker}-${quarters[index]}`}
                className={seriesIndex === 0 ? "primary-line-point" : `peer-line-point peer-${Math.min(seriesIndex, 6)}`}
                cx={xFor(index)}
                cy={yFor(value)}
                r={seriesIndex === 0 ? 3.5 : 2.5}
              >
                <title>{`${item.ticker} · ${quarters[index]} · ${formatValue(value)} ${config.unit}`}</title>
              </circle>
            ))}
          </Fragment>
        ))}
      </svg>
      <div className="chart-legend">
        <span className="primary-legend">{ticker}</span>
        {comparisonTickers.filter((peer) => peer !== ticker).map((peer) => <span key={peer}>{peer}</span>)}
      </div>
    </div>
  );
}

function buildPathSegments(
  values: Array<number | null>,
  xFor: (index: number) => number,
  yFor: (value: number) => number
): string[] {
  const segments: string[] = [];
  let current: string[] = [];

  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${yFor(value).toFixed(1)}`);
  });

  if (current.length > 1) segments.push(current.join(" "));
  return segments;
}

function formatAxis(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (absolute >= 100) return value.toFixed(0);
  if (absolute >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatValue(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

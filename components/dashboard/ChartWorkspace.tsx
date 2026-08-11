"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { getAllQuartersForTicker, quarters, type QuarterlyFinancials } from "@/lib/dashboard/financials-quarterly";
import { getQuarterlyFreeCashFlow } from "@/lib/dashboard/free-cash-flow-quarterly";
import { getCompanyColor } from "@/lib/dashboard/company-colors";
import {
  buildForecastChartSeries,
  FORECAST_CHART_PERIODS,
  forecastQuarterLabel,
  type ForecastChartMetric
} from "@/lib/dashboard/chart-forecast";
import { getChartGuidance, getVisibleChartGuidance } from "@/lib/dashboard/chart-guidance";
import type { RrcCurrentMarketPrices } from "@/lib/forecast/scenarios/rrc-complete";
import type { Metric, Ticker } from "@/lib/dashboard/types";

const WIDTH = 760;
const HEIGHT = 300;
const LEFT = 62;
const RIGHT = 28;
const TOP = 40;
const BOTTOM = 48;

const FORECAST_METRICS = new Set<Metric>(["revenue", "ebitdax", "fcf"]);
const FORECAST_AXIS_LABELS = FORECAST_CHART_PERIODS.map(forecastQuarterLabel);

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
  revenue: {
    label: "Revenue",
    unit: "$MM",
    value: (row) => row.revenue.value,
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
    value: (row) => getQuarterlyFreeCashFlow(row.ticker, row.quarter).value,
    comparable: true
  },
  ebitdax: {
    label: "EBITDAX",
    unit: "$MM",
    value: (row) => row.adjustedEbitdax.value,
    comparable: true
  }
};

type Series = {
  ticker: Ticker;
  values: Array<number | null>;
};

type HoverPoint = {
  key: string;
  x: number;
  y: number;
  ticker: Ticker;
  period: string;
  value: number;
  modeled: boolean;
};

export function ChartWorkspace({
  ticker,
  comparisonTickers,
  title,
  metric,
  currentMarketPrices
}: {
  ticker: Ticker;
  comparisonTickers: Ticker[];
  title: string;
  metric: Metric;
  currentMarketPrices?: RrcCurrentMarketPrices;
}) {
  const config = metricConfig[metric];
  const showsForecast = FORECAST_METRICS.has(metric);
  const tickers = [ticker, ...comparisonTickers.filter((peer) => peer !== ticker)];
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const [showManagementGuidance, setShowManagementGuidance] = useState(false);

  const guidance = useMemo(() => getChartGuidance(ticker, metric), [ticker, metric]);
  const visibleGuidance = getVisibleChartGuidance(guidance, showManagementGuidance);

  useEffect(() => {
    setHover(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, tickers.join(",")]);

  const series: Series[] = useMemo(() => {
    return tickers.map((seriesTicker) => {
      const actualValues = getAllQuartersForTicker(seriesTicker).map(config.value);
      if (!showsForecast) return { ticker: seriesTicker, values: actualValues };

      const forecastPoints = buildForecastChartSeries(seriesTicker, metric as ForecastChartMetric, currentMarketPrices);
      const forecastValues = FORECAST_CHART_PERIODS.map((_, index) => forecastPoints[index]?.value ?? null);
      return { ticker: seriesTicker, values: [...actualValues, ...forecastValues] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(","), metric, showsForecast, currentMarketPrices]);

  const guidanceAxisPeriods = buildGuidanceAxisPeriods(visibleGuidance.map((point) => point.period));
  const axisQuarters = Array.from(new Set([
    ...quarters,
    ...(showsForecast ? FORECAST_AXIS_LABELS : []),
    ...guidanceAxisPeriods
  ]));
  const splitIndex = quarters.length;
  const numericValues = [
    ...series.flatMap((item) => item.values.filter((value): value is number => value !== null)),
    ...visibleGuidance.flatMap((point) => point.kind === "point" ? [point.value] : [point.low, point.high])
  ];

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

  const xFor = (index: number) => LEFT + (index * (WIDTH - LEFT - RIGHT)) / Math.max(axisQuarters.length - 1, 1);
  const yFor = (value: number) => TOP + ((max - value) * (HEIGHT - TOP - BOTTOM)) / (max - min);

  return (
    <div className="chart-area">
      <div>
        <h2>{title}</h2>
        <p>
          Reported actuals are shown through the latest reported quarter. Internal model forecasts are shown separately.
          Dashed overlays represent management guidance where publicly provided; missing guidance is left blank.
        </p>
        {config.caveat ? <p className="muted">{config.caveat}</p> : null}
      </div>
      <div className="chart-guidance-controls">
        <button
          type="button"
          className="chart-guidance-toggle"
          aria-pressed={showManagementGuidance}
          onClick={() => setShowManagementGuidance((current) => !current)}
        >
          {showManagementGuidance ? "Hide" : "Show"} Management Guidance
        </button>
        {guidance.status === "not_provided" ? (
          <span>No public management guidance provided for this metric</span>
        ) : guidance.status === "partial" ? (
          <span>Only explicitly disclosed periods are shown</span>
        ) : null}
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${config.label} comparison for ${tickers.join(", ")} from Q1 2024 through ${axisQuarters[axisQuarters.length - 1]}.`}>
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
          {axisQuarters.map((quarter, index) => (
            index % 2 === 0 || index === axisQuarters.length - 1
              ? <text key={quarter} className="x-axis-label" x={xFor(index)} y={HEIGHT - 20} textAnchor="middle">{quarter.replace(" ", "'")}</text>
              : null
          ))}
        </g>
        {series.map((item, seriesIndex) => {
          const lineClass = seriesIndex === 0 ? "primary-line" : "peer-line";
          const pointClass = seriesIndex === 0 ? "primary-line-point" : "peer-line-point";
          const color = getCompanyColor(item.ticker);
          const actualPaths = buildPathSegments(item.values.slice(0, splitIndex), xFor, yFor);
          const modeledPaths = showsForecast
            ? buildPathSegments(item.values.slice(splitIndex), (index) => xFor(index + splitIndex), yFor)
            : [];
          return (
            <Fragment key={item.ticker}>
              {actualPaths.map((path, segmentIndex) => (
                <path key={`actual-${item.ticker}-${segmentIndex}`} className={lineClass} style={{ stroke: color }} d={path} fill="none" />
              ))}
              {modeledPaths.map((path, segmentIndex) => (
                <path key={`modeled-${item.ticker}-${segmentIndex}`} className={`${lineClass} model-forecast-line`} style={{ stroke: color }} d={path} fill="none" />
              ))}
              {item.values.map((value, index) => {
                if (value === null) return null;
                const modeled = index >= splitIndex;
                const pointKey = `${item.ticker}-${axisQuarters[index]}`;
                const point: HoverPoint = {
                  key: pointKey,
                  x: xFor(index),
                  y: yFor(value),
                  ticker: item.ticker,
                  period: axisQuarters[index],
                  value,
                  modeled
                };
                return (
                  <circle
                    key={pointKey}
                    className={`${pointClass}${modeled ? " model-forecast-point" : ""}`}
                    style={{ fill: color }}
                    cx={point.x}
                    cy={point.y}
                    r={seriesIndex === 0 ? 3.5 : 2.5}
                    tabIndex={0}
                    role="img"
                    aria-label={`${item.ticker} ${axisQuarters[index]} ${formatValue(value)} ${config.unit}${modeled ? " modeled" : ""}`}
                    onMouseEnter={() => setHover(point)}
                    onMouseLeave={() => setHover((current) => (current?.key === pointKey ? null : current))}
                    onFocus={() => setHover(point)}
                    onBlur={() => setHover((current) => (current?.key === pointKey ? null : current))}
                  />
                );
              })}
            </Fragment>
          );
        })}
        {visibleGuidance.map((point) => {
          const index = axisQuarters.indexOf(point.period);
          if (index < 0) return null;
          const x = xFor(index);
          const color = getCompanyColor(ticker);
          const label = `${ticker} management guidance · ${point.disclosure}`;

          if (point.kind === "range") {
            const yLow = yFor(point.low);
            const yHigh = yFor(point.high);
            return (
              <g key={`guidance-${point.period}-${point.disclosure}`} role="img" aria-label={`${label}, range ${formatValue(point.low)} to ${formatValue(point.high)} ${config.unit}`}>
                <line className="management-guidance-range" style={{ stroke: color }} x1={x} y1={yHigh} x2={x} y2={yLow} />
                <line className="management-guidance-cap" style={{ stroke: color }} x1={x - 7} y1={yHigh} x2={x + 7} y2={yHigh} />
                <line className="management-guidance-cap" style={{ stroke: color }} x1={x - 7} y1={yLow} x2={x + 7} y2={yLow} />
              </g>
            );
          }

          const y = yFor(point.value);
          return (
            <g key={`guidance-${point.period}-${point.disclosure}`} role="img" aria-label={`${label}, ${formatValue(point.value)} ${config.unit}`}>
              <line className="management-guidance-line" style={{ stroke: color }} x1={x - 9} y1={y} x2={x + 9} y2={y} />
              <circle className="management-guidance-point" style={{ stroke: color }} cx={x} cy={y} r={5} />
            </g>
          );
        })}
        {hover ? <ChartPointTooltip point={hover} unit={config.unit} chartWidth={WIDTH} chartHeight={HEIGHT} /> : null}
      </svg>
      <div className="chart-legend">
        {tickers.map((seriesTicker) => (
          <span
            key={seriesTicker}
            className={seriesTicker === ticker ? "primary-legend" : undefined}
            style={{ borderColor: getCompanyColor(seriesTicker), color: getCompanyColor(seriesTicker) }}
          >
            {seriesTicker}
          </span>
        ))}
        <span className="chart-semantic-legend actual-legend">Actual</span>
        {showsForecast ? <span className="chart-semantic-legend model-legend">Internal Model Forecast</span> : null}
        <span className="chart-semantic-legend guidance-legend">Management Guidance — dashed</span>
      </div>
    </div>
  );
}

function buildGuidanceAxisPeriods(periods: string[]): string[] {
  const latest = periods
    .map((period) => {
      const match = /^Q([1-4]) (\d{4})$/.exec(period);
      return match ? { quarter: Number(match[1]), year: Number(match[2]) } : null;
    })
    .filter((period): period is { quarter: number; year: number } => period !== null)
    .sort((a, b) => a.year - b.year || a.quarter - b.quarter)
    .at(-1);

  if (!latest || latest.year < 2026) return [];
  const periodsThroughTarget: string[] = [];
  for (let year = 2026; year <= latest.year; year += 1) {
    for (let quarter = year === 2026 ? 2 : 1; quarter <= 4; quarter += 1) {
      if (year === latest.year && quarter > latest.quarter) break;
      periodsThroughTarget.push(`Q${quarter} ${year}`);
    }
  }
  return periodsThroughTarget;
}

// Single reusable tooltip renderer for every chart metric/series (primary, comparison,
// actual, and modeled points) so hover behavior isn't duplicated per metric.
function ChartPointTooltip({
  point,
  unit,
  chartWidth,
  chartHeight
}: {
  point: HoverPoint;
  unit: string;
  chartWidth: number;
  chartHeight: number;
}) {
  const lines = [`${point.ticker} · ${point.period}`, `${formatValue(point.value)} ${unit}`];
  const boxWidth = 140;
  const lineHeight = 15;
  const padding = 8;
  const boxHeight = padding * 2 + lineHeight * lines.length + (point.modeled ? lineHeight : 0);

  const left = Math.min(Math.max(point.x - boxWidth / 2, 4), chartWidth - boxWidth - 4);
  const above = point.y - boxHeight - 12;
  const top = above >= 4 ? above : point.y + 12;
  const clampedTop = Math.min(top, chartHeight - boxHeight - 4);

  return (
    <g className="chart-tooltip" pointerEvents="none">
      <rect x={left} y={clampedTop} width={boxWidth} height={boxHeight} rx={6} />
      {lines.map((line, index) => (
        <text key={line} x={left + padding} y={clampedTop + padding + lineHeight * (index + 1) - 4}>
          {line}
        </text>
      ))}
      {point.modeled ? (
        <text
          className="chart-tooltip-modeled"
          x={left + padding}
          y={clampedTop + padding + lineHeight * (lines.length + 1) - 4}
        >
          Modeled
        </text>
      ) : null}
    </g>
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

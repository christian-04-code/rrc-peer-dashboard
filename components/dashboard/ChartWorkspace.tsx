"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { getAllQuartersForTicker, type QuarterlyFinancials } from "@/lib/dashboard/financials-quarterly";
import { getQuarterlyFreeCashFlow } from "@/lib/dashboard/free-cash-flow-quarterly";
import { getCompanyColor } from "@/lib/dashboard/company-colors";
import {
  buildForecastChartSeries,
  FORECAST_CHART_PERIODS,
  forecastQuarterLabel,
  type ForecastChartMetric
} from "@/lib/dashboard/chart-forecast";
import { getSelectedChartGuidance, getVisibleChartGuidance, type ChartGuidancePoint } from "@/lib/dashboard/chart-guidance";
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
  precision: number;
  value: (row: QuarterlyFinancials) => number | null;
  comparable: boolean;
}> = {
  production: {
    label: "Production",
    unit: "MMcfe/d",
    precision: 3,
    value: (row) => row.production.total.value,
    comparable: true
  },
  revenue: {
    label: "Revenue",
    unit: "$MM",
    precision: 3,
    value: (row) => row.revenue.value,
    comparable: true
  },
  capex: {
    label: "Capital expenditures",
    unit: "$MM",
    precision: 0,
    value: (row) => row.capitalExpenditures.value,
    comparable: true
  },
  debt: {
    label: "Net debt",
    unit: "$MM",
    precision: 3,
    value: (row) => row.netDebt.value,
    comparable: true
  },
  fcf: {
    label: "Free cash flow",
    unit: "$MM",
    precision: 0,
    value: (row) => getQuarterlyFreeCashFlow(row.ticker, row.quarter).value,
    comparable: true
  },
  ebitdax: {
    label: "EBITDAX",
    unit: "$MM",
    precision: 3,
    value: (row) => row.adjustedEbitdax.value,
    comparable: true
  }
};

type Series = {
  ticker: Ticker;
  values: Array<number | null>;
};

type SeriesHoverPoint = {
  kind: "series";
  key: string;
  x: number;
  y: number;
  ticker: Ticker;
  period: string;
  value: number;
  modeled: boolean;
};

type GuidanceHoverPoint = {
  kind: "guidance";
  key: string;
  x: number;
  y: number;
  point: ChartGuidancePoint;
};

type HoverPoint = SeriesHoverPoint | GuidanceHoverPoint;

export function ChartWorkspace({
  selectedTickers,
  title,
  metric,
  currentMarketPrices
}: {
  selectedTickers: Ticker[];
  title: string;
  metric: Metric;
  currentMarketPrices?: RrcCurrentMarketPrices;
}) {
  const config = metricConfig[metric];
  const showsForecast = FORECAST_METRICS.has(metric);
  const tickerKey = selectedTickers.join(",");
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const [showManagementGuidance, setShowManagementGuidance] = useState(false);

  const guidance = useMemo(
    () => getSelectedChartGuidance(selectedTickers, metric),
    [metric, selectedTickers]
  );
  const visibleGuidance = getVisibleChartGuidance(guidance, showManagementGuidance);

  useEffect(() => {
    setHover(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, tickerKey]);

  const actualAxisQuarters = useMemo(() => Array.from(new Set(
    selectedTickers.flatMap((seriesTicker) => getAllQuartersForTicker(seriesTicker).map((row) => row.quarter))
  )), [selectedTickers]);

  const series: Series[] = useMemo(() => {
    return selectedTickers.map((seriesTicker) => {
      const actualByQuarter = new Map(
        getAllQuartersForTicker(seriesTicker).map((row) => [row.quarter, config.value(row)])
      );
      const actualValues = actualAxisQuarters.map((quarter) => actualByQuarter.get(quarter) ?? null);
      if (!showsForecast) return { ticker: seriesTicker, values: actualValues };

      const forecastPoints = buildForecastChartSeries(seriesTicker, metric as ForecastChartMetric, currentMarketPrices);
      const forecastValues = FORECAST_CHART_PERIODS.map((_, index) => forecastPoints[index]?.value ?? null);
      return { ticker: seriesTicker, values: [...actualValues, ...forecastValues] };
    });
  }, [selectedTickers, metric, showsForecast, currentMarketPrices, actualAxisQuarters, config]);

  const guidanceAxisPeriods = buildGuidanceAxisPeriods(visibleGuidance.map((point) => point.plotPeriod));
  const axisQuarters = Array.from(new Set([
    ...actualAxisQuarters,
    ...(showsForecast ? FORECAST_AXIS_LABELS : []),
    ...guidanceAxisPeriods
  ]));
  const splitIndex = actualAxisQuarters.length;
  const numericValues = [
    ...series.flatMap((item) => item.values.filter((value): value is number => value !== null)),
    ...visibleGuidance.flatMap((point) => point.kind === "point" ? [point.chartValue] : [point.chartLow, point.chartHigh])
  ];

  if (!config.comparable || numericValues.length === 0) {
    return (
      <div className="chart-area chart-empty-state">
        <div>
          <h2>{title}</h2>
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
      <h2>{title}</h2>
      {guidance.status === "provided" ? (
        <div className="chart-guidance-controls">
          <button
            type="button"
            className="chart-guidance-toggle"
            aria-pressed={showManagementGuidance}
            aria-label={`Management Guidance ${showManagementGuidance ? "on" : "off"}`}
            onClick={() => setShowManagementGuidance((current) => !current)}
          >
            <span className="chart-guidance-toggle-label">Management Guidance</span>
            <span className="chart-guidance-toggle-state" aria-hidden="true">
              <span className="chart-guidance-toggle-knob" />
              <span>{showManagementGuidance ? "ON" : "OFF"}</span>
            </span>
          </button>
        </div>
      ) : null}
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${config.label} comparison for ${selectedTickers.join(", ")} from Q1 2024 through ${axisQuarters[axisQuarters.length - 1]}.`}>
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
        {series.map((item) => {
          const lineClass = "company-line";
          const pointClass = "company-line-point";
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
                const point: SeriesHoverPoint = {
                  kind: "series",
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
                    r={3}
                    tabIndex={0}
                    role="img"
                  aria-label={`${item.ticker} ${axisQuarters[index]} ${formatSeriesValue(value, config.precision)} ${config.unit}${modeled ? " modeled" : ""}`}
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
          const index = axisQuarters.indexOf(point.plotPeriod);
          if (index < 0) return null;
          const x = xFor(index) + guidanceMarkOffset(point, visibleGuidance);
          const color = getCompanyColor(point.ticker);
          const label = `${point.ticker} Management Guidance · ${point.period}`;
          const pointKey = `guidance-${point.ticker}-${point.plotPeriod}-${point.metric}-${point.period}`;

          if (point.kind === "range") {
            const yLow = yFor(point.chartLow);
            const yHigh = yFor(point.chartHigh);
            const guidanceHover: GuidanceHoverPoint = { kind: "guidance", key: pointKey, x, y: yFor(point.chartMidpoint), point };
            return (
              <g
                key={pointKey}
                role="img"
                tabIndex={0}
                aria-label={`${label}, low ${formatValue(point.low)}, high ${formatValue(point.high)} ${point.unit}${point.status ? `; status ${guidanceTypeLabel(point.status)}` : ""}; source ${point.sourceLocation ?? point.source}, ${point.sourceDate}`}
                onMouseEnter={() => setHover(guidanceHover)}
                onMouseLeave={() => setHover((current) => (current?.key === pointKey ? null : current))}
                onFocus={() => setHover(guidanceHover)}
                onBlur={() => setHover((current) => (current?.key === pointKey ? null : current))}
              >
                <line className="management-guidance-hit-area" x1={x} y1={yHigh} x2={x} y2={yLow} />
                <line className="management-guidance-range" style={{ stroke: color }} x1={x} y1={yHigh} x2={x} y2={yLow} />
                <line className="management-guidance-cap" style={{ stroke: color }} x1={x - 7} y1={yHigh} x2={x + 7} y2={yHigh} />
                <line className="management-guidance-cap" style={{ stroke: color }} x1={x - 7} y1={yLow} x2={x + 7} y2={yLow} />
              </g>
            );
          }

          const y = yFor(point.chartValue);
          const guidanceHover: GuidanceHoverPoint = { kind: "guidance", key: pointKey, x, y, point };
          return (
            <g
              key={pointKey}
              role="img"
              tabIndex={0}
              aria-label={`${label}, ${formatValue(point.value)} ${point.unit}${point.status ? `; status ${guidanceTypeLabel(point.status)}` : ""}; source ${point.sourceLocation ?? point.source}, ${point.sourceDate}`}
              onMouseEnter={() => setHover(guidanceHover)}
              onMouseLeave={() => setHover((current) => (current?.key === pointKey ? null : current))}
              onFocus={() => setHover(guidanceHover)}
              onBlur={() => setHover((current) => (current?.key === pointKey ? null : current))}
            >
              <circle className="management-guidance-point-hit-area" cx={x} cy={y} r={12} />
              <line className="management-guidance-line" style={{ stroke: color }} x1={x - 9} y1={y} x2={x + 9} y2={y} />
              <circle className="management-guidance-point" style={{ stroke: color }} cx={x} cy={y} r={5} />
            </g>
          );
        })}
        {hover ? <ChartPointTooltip point={hover} unit={config.unit} seriesPrecision={config.precision} chartWidth={WIDTH} chartHeight={HEIGHT} /> : null}
      </svg>
      <div className="chart-legend">
        {selectedTickers.map((seriesTicker) => (
          <span
            key={seriesTicker}
            style={{ borderColor: getCompanyColor(seriesTicker), color: getCompanyColor(seriesTicker) }}
          >
            {seriesTicker}
          </span>
        ))}
        <span className="chart-semantic-legend actual-legend">Actual</span>
        {showsForecast ? <span className="chart-semantic-legend model-legend">Internal Model Forecast</span> : null}
        {guidance.status === "provided" ? <span className="chart-semantic-legend guidance-legend">Management Guidance</span> : null}
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

function guidanceMarkOffset(point: ChartGuidancePoint, points: ChartGuidancePoint[]): number {
  const samePeriod = points.filter((candidate) => candidate.plotPeriod === point.plotPeriod);
  const position = samePeriod.indexOf(point);
  return (position - (samePeriod.length - 1) / 2) * 8;
}

// Single reusable tooltip renderer for every selected company, actual/modeled point,
// and management-guidance mark so hover behavior stays consistent across metrics.
function ChartPointTooltip({
  point,
  unit,
  seriesPrecision,
  chartWidth,
  chartHeight
}: {
  point: HoverPoint;
  unit: string;
  seriesPrecision: number;
  chartWidth: number;
  chartHeight: number;
}) {
  const lines = point.kind === "guidance" ? guidanceTooltipLines(point.point) : [
    `${point.ticker} · ${point.period}`,
    `${formatSeriesValue(point.value, seriesPrecision)} ${unit}`,
    ...(point.modeled ? ["Modeled"] : [])
  ];
  const boxWidth = point.kind === "guidance" ? 250 : 140;
  const lineHeight = 15;
  const padding = 8;
  const boxHeight = padding * 2 + lineHeight * lines.length;

  const left = Math.min(Math.max(point.x - boxWidth / 2, 4), chartWidth - boxWidth - 4);
  const above = point.y - boxHeight - 12;
  const top = above >= 4 ? above : point.y + 12;
  const clampedTop = Math.min(top, chartHeight - boxHeight - 4);

  return (
    <g className="chart-tooltip" pointerEvents="none">
      <rect x={left} y={clampedTop} width={boxWidth} height={boxHeight} rx={6} />
      {lines.map((line, index) => (
        <text key={`${line}-${index}`} className={line === "Modeled" ? "chart-tooltip-modeled" : undefined} x={left + padding} y={clampedTop + padding + lineHeight * (index + 1) - 4}>
          {line}
        </text>
      ))}
    </g>
  );
}

function guidanceTooltipLines(point: ChartGuidancePoint): string[] {
  const lines = [`${point.ticker} · Management Guidance`, `${guidanceMetricLabel(point.metric)} · ${point.period}`, guidanceTypeLabel(point.guidanceType)];
  if (point.status) lines.push(`Status: ${guidanceTypeLabel(point.status)}`);
  if (point.kind === "range") {
    lines.push(`Low: ${formatValue(point.low)} ${point.unit}`);
    if (point.midpoint !== null) lines.push(`Midpoint: ${formatValue(point.midpoint)} ${point.unit}`);
    lines.push(`High: ${formatValue(point.high)} ${point.unit}`);
  } else {
    lines.push(`Value: ${formatValue(point.value)} ${point.unit}`);
  }
  lines.push(`Source: ${point.sourceLocation ?? point.source} · ${point.sourceDate}`);
  return lines;
}

function guidanceMetricLabel(metric: Metric): string {
  return metricConfig[metric].label;
}

function guidanceTypeLabel(type: ChartGuidancePoint["guidanceType"]): string {
  const labels: Record<string, string> = {
    range: "Range",
    approximate: "Approximate target",
    long_term_target: "Long-term target",
    conditional_target: "Conditional long-term target",
    minimum_growth: "Minimum growth target"
  };
  return labels[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function formatSeriesValue(value: number, precision: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  }).format(value);
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StockHistoryObservation } from "@/lib/market/stock-detail-types";

const RANGES = ["1M", "6M", "YTD", "1Y", "3Y", "5Y"] as const;
type Range = typeof RANGES[number];

function rangeStart(latest: string, range: Range): Date {
  const date = new Date(`${latest}T00:00:00Z`);
  if (range === "YTD") return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  if (range === "1M") date.setUTCMonth(date.getUTCMonth() - 1);
  else if (range === "6M") date.setUTCMonth(date.getUTCMonth() - 6);
  else date.setUTCFullYear(date.getUTCFullYear() - Number(range[0]));
  return date;
}

function downsample(points: StockHistoryObservation[], limit: number): StockHistoryObservation[] {
  if (points.length <= limit) return points;
  const result = [points[0]];
  const bucket = (points.length - 2) / Math.max(1, Math.floor(limit / 2) - 1);
  for (let start = 1; start < points.length - 1; start += bucket) {
    const slice = points.slice(Math.floor(start), Math.min(points.length - 1, Math.floor(start + bucket)));
    if (!slice.length) continue;
    const low = slice.reduce((a, b) => a.close <= b.close ? a : b);
    const high = slice.reduce((a, b) => a.close >= b.close ? a : b);
    result.push(...(low.date < high.date ? [low, high] : [high, low]));
  }
  result.push(points.at(-1)!);
  return [...new Map(result.map((point) => [point.date, point])).values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function StockPriceChart({ observations, ticker }: { observations: StockHistoryObservation[]; ticker: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  const [range, setRange] = useState<Range>("5Y");
  const [hovered, setHovered] = useState<number | null>(null);
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const update = () => setWidth(Math.max(280, Math.round(node.clientWidth)));
    update();
    const observer = new ResizeObserver(update); observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const filtered = useMemo(() => {
    const latest = observations.at(-1)!;
    const start = rangeStart(latest.date, range);
    return observations.filter((point) => new Date(`${point.date}T00:00:00Z`) >= start);
  }, [observations, range]);
  const rendered = useMemo(() => downsample(filtered, Math.max(180, Math.floor(width * 0.9))), [filtered, width]);
  const mobile = width < 520;
  const height = mobile ? 300 : 370;
  const margin = mobile ? { top: 18, right: 10, bottom: 42, left: 48 } : { top: 20, right: 18, bottom: 44, left: 62 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const prices = rendered.map((point) => point.close);
  const rawMin = Math.min(...prices), rawMax = Math.max(...prices);
  const padding = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.015, 0.25);
  const min = Math.max(0, rawMin - padding), max = rawMax + padding;
  const x = (index: number) => margin.left + (rendered.length === 1 ? plotWidth / 2 : index / (rendered.length - 1) * plotWidth);
  const y = (price: number) => margin.top + (max - price) / Math.max(max - min, 1) * plotHeight;
  const path = rendered.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.close).toFixed(1)}`).join(" ");
  const yTicks = Array.from({ length: 5 }, (_, index) => min + (max - min) * index / 4);
  const dateTickCount = mobile ? 3 : 5;
  const dateTicks = Array.from({ length: dateTickCount }, (_, index) => Math.round(index * (rendered.length - 1) / Math.max(1, dateTickCount - 1)));
  const active = hovered === null ? null : rendered[hovered];
  const activeX = hovered === null ? 0 : x(hovered);
  const tooltipWidth = mobile ? 126 : 142;
  const tooltipX = Math.min(width - margin.right - tooltipWidth, Math.max(margin.left, activeX - tooltipWidth / 2));

  function selectPoint(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect();
    const local = clientX - rect.left;
    const index = Math.round((local - margin.left) / plotWidth * (rendered.length - 1));
    setHovered(Math.max(0, Math.min(rendered.length - 1, index)));
  }

  return <div className="stock-chart-wrap" ref={wrapRef}>
    <div className="stock-range-controls" aria-label="Historical price range">{RANGES.map((value) => <button key={value} className={range === value ? "active" : ""} aria-pressed={range === value} onClick={() => { setRange(value); setHovered(null); }}>{value}</button>)}</div>
    <svg className="stock-price-chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${ticker} ${range} historical share price chart`} onPointerMove={(event) => selectPoint(event.clientX, event.currentTarget)} onPointerLeave={() => setHovered(null)}>
      <g className="stock-chart-grid">{yTicks.map((tick) => <g key={tick}><line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} /><text x={margin.left - 8} y={y(tick) + 4} textAnchor="end">${tick.toFixed(tick < 10 ? 2 : 0)}</text></g>)}</g>
      <path className="stock-chart-area" d={`${path} L${x(rendered.length - 1)},${margin.top + plotHeight} L${x(0)},${margin.top + plotHeight} Z`} />
      <path className="stock-chart-line" d={path} />
      <g className="stock-date-axis">{dateTicks.map((index) => <text key={`${index}-${rendered[index].date}`} x={x(index)} y={height - 15} textAnchor={index === 0 ? "start" : index === rendered.length - 1 ? "end" : "middle"}>{new Date(`${rendered[index].date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })}</text>)}</g>
      {active && <g className="stock-chart-tooltip"><line x1={activeX} x2={activeX} y1={margin.top} y2={margin.top + plotHeight} /><circle cx={activeX} cy={y(active.close)} r="4" /><rect x={tooltipX} y={margin.top + 7} width={tooltipWidth} height="48" rx="7" /><text x={tooltipX + 10} y={margin.top + 26}>{new Date(`${active.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</text><text className="tooltip-price" x={tooltipX + 10} y={margin.top + 45}>Close ${active.close.toFixed(2)}</text></g>}
    </svg>
    <div className="stock-chart-caption"><span>{filtered.length.toLocaleString()} trading observations</span><span>Hover or drag for daily prices</span></div>
  </div>;
}

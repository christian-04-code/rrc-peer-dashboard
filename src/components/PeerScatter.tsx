import { NEUTRAL_COLOR, PEER_COLOR_SOFT, PEER_COLORS } from "@/lib/constants";
import { formatValue } from "@/lib/metrics";
import type { ScatterPoint } from "@/lib/overview";

const VIEW_W = 560;
const VIEW_H = 340;
const LEFT = 56;
const RIGHT = 24;
const TOP = 20;
const BOTTOM = 40;
const CHART_W = VIEW_W - LEFT - RIGHT;
const CHART_H = VIEW_H - TOP - BOTTOM;

export function PeerScatter({
  points,
  xUnit,
  yUnit,
  xLabel,
  yLabel,
  title,
  subtitle,
}: {
  points: ScatterPoint[];
  xUnit: string;
  yUnit: string;
  xLabel: string;
  yLabel: string;
  title: string;
  subtitle: string;
}) {
  const plottable = points.filter((p) => p.x !== null && p.y !== null) as (ScatterPoint & { x: number; y: number })[];
  const missing = points.filter((p) => p.x === null || p.y === null);

  const xs = plottable.map((p) => p.x);
  const ys = plottable.map((p) => p.y);
  const hasData = plottable.length > 0;

  const xMax = hasData ? Math.max(...xs, 0) : 1;
  const xMin = hasData ? Math.min(...xs, 0) : 0;
  const yMax = hasData ? Math.max(...ys, 0) : 1;
  const yMin = hasData ? Math.min(...ys, 0) : 0;
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  const xDomainMax = xMax + xSpan * 0.15;
  const xDomainMin = xMin - xSpan * 0.15;
  const yDomainMax = yMax + ySpan * 0.15;
  const yDomainMin = yMin - ySpan * 0.15;

  const toX = (v: number) => LEFT + ((v - xDomainMin) / (xDomainMax - xDomainMin || 1)) * CHART_W;
  const toY = (v: number) => TOP + CHART_H - ((v - yDomainMin) / (yDomainMax - yDomainMin || 1)) * CHART_H;

  const gridX = [0, 0.25, 0.5, 0.75, 1].map((f) => LEFT + f * CHART_W);
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => TOP + f * CHART_H);

  return (
    <div className="rounded-[10px] border border-border bg-panel px-6.5 py-6 pb-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h3 className="text-[14.5px] font-semibold text-white">{title}</h3>
          <div className="mt-0.5 font-mono text-[10.5px] text-text-faint">{subtitle}</div>
        </div>
      </div>

      {!hasData ? (
        <div className="flex h-[260px] items-center justify-center font-mono text-[12px] text-text-faint">
          No peers have both metrics available.
        </div>
      ) : (
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" height={VIEW_H} style={{ overflow: "visible" }}>
          <g stroke="#1D242E" strokeWidth={1}>
            {gridX.map((x) => (
              <line key={`gx${x}`} x1={x} y1={TOP} x2={x} y2={TOP + CHART_H} />
            ))}
            {gridY.map((y) => (
              <line key={`gy${y}`} x1={LEFT} y1={y} x2={LEFT + CHART_W} y2={y} />
            ))}
          </g>
          {xDomainMin < 0 && xDomainMax > 0 && (
            <line x1={toX(0)} y1={TOP} x2={toX(0)} y2={TOP + CHART_H} stroke="#4A5563" strokeWidth={1} strokeDasharray="4,4" />
          )}
          {yDomainMin < 0 && yDomainMax > 0 && (
            <line x1={LEFT} y1={toY(0)} x2={LEFT + CHART_W} y2={toY(0)} stroke="#4A5563" strokeWidth={1} strokeDasharray="4,4" />
          )}
          <g fontFamily="var(--mono)" fontSize={10} fill="#525C68">
            <text x={LEFT} y={TOP + CHART_H + 16} textAnchor="start">
              {formatValue(xDomainMin, xUnit)}
            </text>
            <text x={LEFT + CHART_W} y={TOP + CHART_H + 16} textAnchor="end">
              {formatValue(xDomainMax, xUnit)}
            </text>
            <text x={LEFT - 8} y={TOP + CHART_H + 4} textAnchor="end">
              {formatValue(yDomainMin, yUnit)}
            </text>
            <text x={LEFT - 8} y={TOP + 8} textAnchor="end">
              {formatValue(yDomainMax, yUnit)}
            </text>
          </g>
          <text x={LEFT + CHART_W / 2} y={VIEW_H - 4} textAnchor="middle" fontFamily="var(--mono)" fontSize={10.5} fill="#828E9C">
            {xLabel} ({xUnit})
          </text>
          <text
            x={14}
            y={TOP + CHART_H / 2}
            textAnchor="middle"
            fontFamily="var(--mono)"
            fontSize={10.5}
            fill="#828E9C"
            transform={`rotate(-90 14 ${TOP + CHART_H / 2})`}
          >
            {yLabel} ({yUnit})
          </text>
          {[...plottable].sort((a, b) => Number(a.isRRC) - Number(b.isRRC)).map((p) => {
            const color = p.isRRC ? "var(--blue)" : (PEER_COLORS[p.ticker] ?? NEUTRAL_COLOR);
            const labelColor = p.isRRC ? "var(--blue-soft)" : (PEER_COLOR_SOFT[p.ticker] ?? "#828E9C");
            const cx = toX(p.x);
            const cy = toY(p.y);
            return (
              <g key={p.ticker}>
                <circle cx={cx} cy={cy} r={p.isRRC ? 8 : 5.5} fill={color} stroke="var(--panel)" strokeWidth={p.isRRC ? 2 : 1.5} />
                <text
                  x={cx}
                  y={cy - (p.isRRC ? 14 : 10)}
                  textAnchor="middle"
                  fontFamily="var(--mono)"
                  fontSize={p.isRRC ? 11 : 10}
                  fontWeight={p.isRRC ? 700 : 500}
                  fill={labelColor}
                >
                  {p.ticker}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {missing.length > 0 && (
        <div className="mt-2.5 font-mono text-[10px] text-text-faint">
          Not plotted (missing {xLabel.toLowerCase()} or {yLabel.toLowerCase()}): {missing.map((m) => m.ticker).join(", ")}
        </div>
      )}
      <div className="mt-1.5 font-mono text-[10px] text-text-faint">Source: historical.json (normalized_metrics). Nulls are omitted, never estimated.</div>
    </div>
  );
}

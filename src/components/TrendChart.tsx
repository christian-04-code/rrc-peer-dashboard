import { NEUTRAL_COLOR, PEER_COLORS } from "@/lib/constants";
import { formatValue } from "@/lib/metrics";
import type { TrendSeries } from "@/lib/overview";
import type { Quarter } from "@/lib/types";

const VIEW_W = 1140;
const VIEW_H = 300;
const LEFT = 56;
const RIGHT = 16;
const TOP = 20;
const BASE = 236;
const CHART_H = BASE - TOP;
const CHART_W = VIEW_W - LEFT - RIGHT;

function buildLinePath(points: { x: number; value: number | null }[], toY: (v: number) => number): string {
  let d = "";
  let drawing = false;
  for (const p of points) {
    if (p.value === null) {
      drawing = false;
      continue;
    }
    const y = toY(p.value);
    d += drawing ? ` L ${p.x} ${y}` : `M ${p.x} ${y}`;
    drawing = true;
  }
  return d;
}

export function TrendChart({
  series,
  quarters,
  unit,
  title,
  subtitle,
}: {
  series: TrendSeries[];
  quarters: Quarter[];
  unit: string;
  title: string;
  subtitle: string;
}) {
  const allValues = series.flatMap((s) => s.points.map((p) => p.value)).filter((v): v is number => v !== null);
  const hasData = allValues.length > 0;
  const rawMax = hasData ? Math.max(...allValues) : 1;
  const rawMin = hasData ? Math.min(...allValues, 0) : 0;
  const span = rawMax - rawMin || 1;
  const maxValue = rawMax + span * 0.1;
  const minValue = rawMin - span * 0.05;

  const toY = (v: number) => BASE - ((v - minValue) / (maxValue - minValue || 1)) * CHART_H;
  const zeroY = toY(0);

  const xFor = (i: number) => LEFT + (quarters.length === 1 ? CHART_W / 2 : (i / (quarters.length - 1)) * CHART_W);

  const gridLines = [0, 1, 2, 3].map((i) => TOP + (CHART_H / 3) * i);

  // Render non-RRC series first so RRC's line always sits on top.
  const ordered = [...series].sort((a, b) => Number(a.isRRC) - Number(b.isRRC));

  return (
    <div className="rounded-[10px] border border-border bg-panel px-6.5 py-6 pb-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h3 className="text-[14.5px] font-semibold text-white">{title}</h3>
          <div className="mt-0.5 font-mono text-[10.5px] text-text-faint">{subtitle}</div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {series.map((s) => (
            <div key={s.ticker} className="flex items-center gap-1.5">
              <span
                className="inline-block h-[3px] w-3 rounded-full"
                style={{ background: s.isRRC ? "var(--blue)" : (PEER_COLORS[s.ticker] ?? NEUTRAL_COLOR) }}
              />
              <span
                className="font-mono text-[10.5px]"
                style={{ color: s.isRRC ? "var(--blue-soft)" : "#828E9C", fontWeight: s.isRRC ? 700 : 400 }}
              >
                {s.ticker}
              </span>
            </div>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="flex h-[220px] items-center justify-center font-mono text-[12px] text-text-faint">
          No historical data available for this metric.
        </div>
      ) : (
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" height={VIEW_H} style={{ overflow: "visible" }}>
          <g stroke="#1D242E" strokeWidth={1}>
            {gridLines.map((y) => (
              <line key={y} x1={LEFT} y1={y} x2={VIEW_W - RIGHT} y2={y} />
            ))}
          </g>
          {minValue < 0 && maxValue > 0 && (
            <line x1={LEFT} y1={zeroY} x2={VIEW_W - RIGHT} y2={zeroY} stroke="#4A5563" strokeWidth={1} strokeDasharray="4,4" />
          )}
          <g fontFamily="var(--mono)" fontSize={10} fill="#525C68">
            {gridLines.map((y) => (
              <text key={y} x={LEFT - 8} y={y + 3} textAnchor="end">
                {formatValue(minValue + ((BASE - y) / CHART_H) * (maxValue - minValue), unit)}
              </text>
            ))}
          </g>
          <g fontFamily="var(--mono)" fontSize={10.5} fill="#828E9C" textAnchor="middle">
            {quarters.map((q, i) => (
              <text key={q} x={xFor(i)} y={BASE + 20}>
                {q.replace("20", "'")}
              </text>
            ))}
          </g>
          {ordered.map((s) => {
            const points = s.points.map((p, i) => ({ x: xFor(i), value: p.value }));
            const path = buildLinePath(points, toY);
            const color = s.isRRC ? "var(--blue)" : (PEER_COLORS[s.ticker] ?? NEUTRAL_COLOR);
            return (
              <g key={s.ticker}>
                <path d={path} fill="none" stroke={color} strokeWidth={s.isRRC ? 3 : 1.5} strokeLinejoin="round" strokeLinecap="round" opacity={s.isRRC ? 1 : 0.75} />
                {points.map((p, i) =>
                  p.value === null ? null : (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={toY(p.value)}
                      r={s.isRRC ? 3.5 : 2}
                      fill={color}
                      stroke="var(--panel)"
                      strokeWidth={s.isRRC ? 1.5 : 1}
                    />
                  ),
                )}
              </g>
            );
          })}
        </svg>
      )}
      <div className="mt-3.5 font-mono text-[10px] text-text-faint">Source: historical.json — Actual reported values only. {subtitle}</div>
    </div>
  );
}

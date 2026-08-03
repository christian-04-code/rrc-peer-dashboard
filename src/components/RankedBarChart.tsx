import { NEUTRAL_COLOR, PEER_COLOR_SOFT, PEER_COLORS } from "@/lib/constants";
import { formatValue } from "@/lib/metrics";
import type { RankedBarDatum } from "@/lib/overview";

const VIEW_W = 1140;
const VIEW_H = 260;
const TOP = 20;
const BASE = 200;
const CHART_H = BASE - TOP;

export function RankedBarChart({
  bars,
  median,
  unit,
  title,
  subtitle,
}: {
  bars: RankedBarDatum[];
  median: number | null;
  unit: string;
  title: string;
  subtitle: string;
}) {
  const values = bars.map((b) => b.value).filter((v): v is number => v !== null);
  const maxValue = Math.max(...values, median ?? 0, 1e-9);

  const slotWidth = VIEW_W / bars.length;
  const barWidth = Math.min(90, slotWidth * 0.62);

  const medianY = median !== null ? BASE - (median / maxValue) * CHART_H : null;

  const gridLines = [0, 1, 2, 3].map((i) => TOP + (CHART_H / 3) * i);

  return (
    <div className="rounded-[10px] border border-border bg-panel px-6.5 py-6 pb-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h3 className="text-[14.5px] font-semibold text-white">{title}</h3>
          <div className="mt-0.5 font-mono text-[10.5px] text-text-faint">{subtitle}</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" height={VIEW_H} style={{ overflow: "visible" }}>
        <g stroke="#1D242E" strokeWidth={1}>
          {gridLines.map((y) => (
            <line key={y} x1={0} y1={y} x2={VIEW_W} y2={y} />
          ))}
        </g>
        {medianY !== null && (
          <>
            <line x1={0} y1={medianY} x2={VIEW_W} y2={medianY} stroke="#4A5563" strokeWidth={1.5} strokeDasharray="5,4" />
            <text x={4} y={medianY - 6} fontFamily="var(--mono)" fontSize={10} fill="#828E9C">
              median {formatValue(median, unit)}
            </text>
          </>
        )}
        <g fontFamily="var(--mono)" fontSize={11} fill="#828E9C" textAnchor="middle">
          {bars.map((bar, i) => {
            if (bar.value === null) return null;
            const x = i * slotWidth + (slotWidth - barWidth) / 2;
            const h = (bar.value / maxValue) * CHART_H;
            const y = BASE - h;
            const fill = bar.isRRC ? "var(--blue)" : (PEER_COLORS[bar.ticker] ?? NEUTRAL_COLOR);
            const labelColor = bar.isRRC ? "var(--blue-soft)" : "#E7ECF2";
            const tickerColor = bar.isRRC ? "var(--blue-soft)" : (PEER_COLOR_SOFT[bar.ticker] ?? "#828E9C");
            return (
              <g key={bar.ticker}>
                <rect x={x} y={y} width={barWidth} height={h} rx={4} fill={fill} />
                <text x={x + barWidth / 2} y={y - 6} fill={labelColor} fontWeight={bar.isRRC ? 700 : 600}>
                  {formatValue(bar.value, unit)}
                </text>
                <text x={x + barWidth / 2} y={BASE + 18} fill={tickerColor} fontWeight={bar.isRRC ? 700 : 400}>
                  {bar.ticker}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="mt-3.5 font-mono text-[10px] text-text-faint">Source: historical.json, {subtitle}</div>
    </div>
  );
}

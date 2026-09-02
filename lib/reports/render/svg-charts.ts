import type { ChartPlan } from "@/lib/reports/render/render-model";

/**
 * Phase 7D deterministic inline SVG bar-chart rendering -- no chart library
 * dependency, no client-side JS, no canvas. A pure function of a ChartPlan's
 * already-computed bars; draws only what those bars' own values/labels say,
 * nothing estimated or interpolated. Kept intentionally simple (bars only,
 * one axis, direct value labels instead of a legend) per the brief's
 * chart-quality rules: readable at print size, limited series, no
 * chartjunk, no dual axes, no 3D.
 */

const WIDTH = 480;
const HEIGHT = 190;
const TOP_MARGIN = 40; // room for the title + the tallest bar's value label
const BOTTOM_MARGIN = 30; // room for category labels
const SIDE_MARGIN = 16;
const BAR_GAP = 14;

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** "RRC"/"Current"/"Actual (...)" bars are the chart's own subject and get the accent color; every other bar (a comparison point or a peer) gets the muted color, so the eye lands on the one bar that matters most. */
function isHighlightBar(kind: ChartPlan["kind"], label: string): boolean {
  if (kind === "peerBar") return label === "RRC";
  if (kind === "actualVsForecastBar") return label.startsWith("Actual");
  return label === "Current";
}

/**
 * Decides the plot's vertical floor/ceiling. A genuinely negative bar (e.g.
 * free cash flow) always keeps a real, visible zero baseline -- values never
 * get compressed against a floor that would hide which side of zero they
 * fall on. For all-positive values that sit within a tight relative band
 * (e.g. four storage readings all within ~6% of each other, or two Henry
 * Hub prints a week apart), forcing the floor to zero makes every bar read
 * as "full height" and hides the real week-over-week difference the chart
 * exists to show -- so the floor is instead set just below the lowest bar.
 * This changes how tall a bar LOOKS, never what it says: every bar still
 * prints its own exact value/displayValue, so the chart stays an honest aid
 * to a number that's always shown explicitly, not the numbers' only source.
 * A band already wide enough to read clearly against zero (>=20% spread)
 * keeps the standard zero floor -- this only kicks in where zero would
 * otherwise flatten a real, legitimate distinction.
 */
function computePlotRange(values: number[]): { plotMin: number; plotMax: number; drawZeroLine: boolean } {
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);

  if (rawMin < 0) {
    return { plotMin: rawMin, plotMax: Math.max(0, rawMax), drawZeroLine: rawMax > 0 };
  }

  const spread = rawMax - rawMin;
  const relativeSpread = rawMax === 0 ? 0 : spread / rawMax;
  if (rawMax === 0 || relativeSpread >= 0.2) {
    return { plotMin: 0, plotMax: rawMax, drawZeroLine: false };
  }

  const padding = spread > 0 ? spread * 1.5 : rawMin * 0.08;
  return { plotMin: Math.max(0, rawMin - padding), plotMax: rawMax, drawZeroLine: false };
}

export function renderBarChartSvg(chart: ChartPlan): string {
  const plotWidth = WIDTH - SIDE_MARGIN * 2;
  const plotHeight = HEIGHT - TOP_MARGIN - BOTTOM_MARGIN;
  const values = chart.bars.map((b) => b.value);
  const { plotMin, plotMax, drawZeroLine } = computePlotRange(values);
  const range = plotMax - plotMin || 1;
  const scale = plotHeight / range;
  const floorY = TOP_MARGIN + plotHeight;

  const n = chart.bars.length;
  const barWidth = Math.max(18, (plotWidth - BAR_GAP * (n - 1)) / n);

  const bars = chart.bars
    .map((bar, index) => {
      const x = SIDE_MARGIN + index * (barWidth + BAR_GAP);
      const barHeight = (bar.value - plotMin) * scale;
      const y = floorY - barHeight;
      const color = isHighlightBar(chart.kind, bar.label) ? "#0081c6" : "#9fb7cc";
      return [
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(barHeight, 0.5).toFixed(1)}" fill="${color}" rx="2" />`,
        `<text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="11" font-family="Arial, Helvetica, sans-serif" fill="#0b2947" font-weight="600">${escapeXml(bar.displayValue)}</text>`,
        `<text x="${(x + barWidth / 2).toFixed(1)}" y="${(HEIGHT - BOTTOM_MARGIN + 16).toFixed(1)}" text-anchor="middle" font-size="10.5" font-family="Arial, Helvetica, sans-serif" fill="#4a6178">${escapeXml(bar.label)}</text>`
      ].join("");
    })
    .join("");

  const zeroLine = drawZeroLine
    ? `<line x1="${SIDE_MARGIN}" y1="${(floorY - (0 - plotMin) * scale).toFixed(1)}" x2="${(WIDTH - SIDE_MARGIN).toFixed(1)}" y2="${(floorY - (0 - plotMin) * scale).toFixed(1)}" stroke="#8a9bab" stroke-width="1" stroke-dasharray="2,2" />`
    : "";

  const title = escapeXml(chart.unit ? `${chart.title} (${chart.unit})` : chart.title);

  return [
    `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" role="img" aria-label="${title}" xmlns="http://www.w3.org/2000/svg">`,
    `<text x="${SIDE_MARGIN}" y="14" font-size="12.5" font-family="Arial, Helvetica, sans-serif" fill="#0b2947" font-weight="700">${title}</text>`,
    `<line x1="${SIDE_MARGIN}" y1="${floorY.toFixed(1)}" x2="${(WIDTH - SIDE_MARGIN).toFixed(1)}" y2="${floorY.toFixed(1)}" stroke="#c7d4de" stroke-width="1" />`,
    zeroLine,
    bars,
    `</svg>`
  ].join("");
}

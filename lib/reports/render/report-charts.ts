import type { ColumnChartPlan, LineChartPlan, PeerBarPanel } from "@/lib/reports/render/render-model";

/**
 * Plain-English report pass (2026-10-13): the trend/peer charts the
 * redesigned PDF needs, in the same no-dependency inline-SVG style as
 * svg-charts.ts (no chart library, no client JS). Each function is a pure
 * function of an already-built plan and draws only the plan's own points --
 * nothing is interpolated, smoothed, or filled in. A gap in the data stays a
 * gap (the line simply breaks) rather than being bridged.
 */

// Same embedded font as the page body (report-font.ts); single quotes because this is
// interpolated into double-quoted SVG attributes.
const FONT = "'Report Sans', Arial, Helvetica, sans-serif";
const INK = "#0b2947";
const AXIS_TEXT = "#5b7288";
const GRID = "#e3eaf1";
const PRIMARY = "#0081c6";
const REFERENCE = "#8a9bab";
const MUTED_BAR = "#b9cad9";
const NEGATIVE = "#c2410c";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** ~4 evenly spaced, human-round gridline values covering [min, max]. */
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(period: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);
  if (!match) return period;
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}`;
}

function formatLineValue(value: number, format: LineChartPlan["valueFormat"], forTick: boolean): string {
  if (format === "usd_per_mmbtu") return `$${value.toFixed(2)}`;
  const rounded = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  return forTick ? rounded : `${rounded} Bcf`;
}

export function renderLineChartSvg(chart: LineChartPlan): string {
  const WIDTH = 680;
  const HEIGHT = 230;
  const LEFT = 54;
  const RIGHT = 88; // room for the end-of-line value labels
  const TOP = 30;
  const BOTTOM = 26;
  const plotW = WIDTH - LEFT - RIGHT;
  const plotH = HEIGHT - TOP - BOTTOM;

  const xs = chart.series[0]?.points.map((p) => p.x) ?? [];
  const allValues = chart.series.flatMap((s) => s.points.map((p) => p.y).filter((y): y is number => y !== null));
  if (xs.length < 2 || allValues.length < 2) return "";

  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const pad = (rawMax - rawMin) * 0.12 || rawMax * 0.05 || 1;
  const ticks = niceTicks(rawMin - pad, rawMax + pad);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const xAt = (i: number) => LEFT + (i / (xs.length - 1)) * plotW;
  const yAt = (v: number) => TOP + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  const grid = ticks
    .map((t) => {
      const y = yAt(t).toFixed(1);
      return `<line x1="${LEFT}" y1="${y}" x2="${WIDTH - RIGHT}" y2="${y}" stroke="${GRID}" stroke-width="1" /><text x="${LEFT - 8}" y="${(yAt(t) + 4).toFixed(1)}" text-anchor="end" font-size="12.5" font-family="${FONT}" fill="${AXIS_TEXT}">${escapeXml(formatLineValue(t, chart.valueFormat, true))}</text>`;
    })
    .join("");

  const tickCount = Math.min(5, xs.length);
  const xLabels = Array.from({ length: tickCount }, (_, k) => Math.round((k / (tickCount - 1)) * (xs.length - 1)))
    .map((i) => `<text x="${xAt(i).toFixed(1)}" y="${HEIGHT - 6}" text-anchor="${i === 0 ? "start" : i === xs.length - 1 ? "end" : "middle"}" font-size="12.5" font-family="${FONT}" fill="${AXIS_TEXT}">${escapeXml(shortDate(xs[i]))}</text>`)
    .join("");

  const primaryLast = [...(chart.series.find((s) => s.style === "primary")?.points ?? [])].reverse().find((p) => p.y !== null);
  const lines = chart.series
    .map((series) => {
      // Break the path at any null rather than drawing across a missing value.
      let d = "";
      let penDown = false;
      series.points.forEach((p, i) => {
        if (p.y === null) {
          penDown = false;
          return;
        }
        d += `${penDown ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(p.y).toFixed(1)} `;
        penDown = true;
      });
      const isPrimary = series.style === "primary";
      const last = [...series.points].reverse().find((p) => p.y !== null);
      const lastIndex = last ? series.points.lastIndexOf(last) : -1;
      const collides = !isPrimary && primaryLast && primaryLast.y !== null && last && last.y !== null && Math.abs(yAt(primaryLast.y) - yAt(last.y)) < 16;
      const endLabel =
        last && last.y !== null && !collides
          ? `<circle cx="${xAt(lastIndex).toFixed(1)}" cy="${yAt(last.y).toFixed(1)}" r="${isPrimary ? 3.5 : 2.5}" fill="${isPrimary ? PRIMARY : REFERENCE}" /><text x="${(xAt(lastIndex) + 7).toFixed(1)}" y="${(yAt(last.y) + 4).toFixed(1)}" font-size="13" font-weight="${isPrimary ? 700 : 400}" font-family="${FONT}" fill="${isPrimary ? INK : AXIS_TEXT}">${escapeXml(formatLineValue(last.y, chart.valueFormat, false))}</text>`
          : "";
      return `<path d="${d.trim()}" fill="none" stroke="${isPrimary ? PRIMARY : REFERENCE}" stroke-width="${isPrimary ? 2.4 : 1.6}" ${isPrimary ? "" : 'stroke-dasharray="5,4"'} stroke-linejoin="round" stroke-linecap="round" />${endLabel}`;
    })
    .join("");

  const legend =
    chart.series.length > 1
      ? chart.series
          .map((series, k) => {
            const x = LEFT + k * 170;
            const isPrimary = series.style === "primary";
            return `<line x1="${x}" y1="12" x2="${x + 20}" y2="12" stroke="${isPrimary ? PRIMARY : REFERENCE}" stroke-width="${isPrimary ? 2.4 : 1.6}" ${isPrimary ? "" : 'stroke-dasharray="5,4"'} /><text x="${x + 26}" y="16" font-size="12.5" font-family="${FONT}" fill="${INK}">${escapeXml(series.label)}</text>`;
          })
          .join("")
      : "";

  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" role="img" aria-label="${escapeXml(chart.title)}" xmlns="http://www.w3.org/2000/svg">${legend}${grid}${lines}${xLabels}</svg>`;
}

export function renderColumnChartSvg(chart: ColumnChartPlan): string {
  const WIDTH = 680;
  const HEIGHT = 210;
  const LEFT = 16;
  const RIGHT = 16;
  const TOP = 22;
  const BOTTOM = 26;
  const GAP = 12;
  const plotW = WIDTH - LEFT - RIGHT;
  const plotH = HEIGHT - TOP - BOTTOM;
  if (chart.bars.length === 0) return "";

  const values = chart.bars.map((b) => b.value);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const zeroY = TOP + (max / span) * plotH;
  const n = chart.bars.length;
  const barW = (plotW - GAP * (n - 1)) / n;

  const bars = chart.bars
    .map((bar, i) => {
      const x = LEFT + i * (barW + GAP);
      const h = (Math.abs(bar.value) / span) * plotH;
      const y = bar.value >= 0 ? zeroY - h : zeroY;
      const isLatest = i === n - 1;
      const fill = bar.value < 0 ? NEGATIVE : isLatest ? PRIMARY : MUTED_BAR;
      const labelY = bar.value >= 0 ? y - 5 : y + h + 13;
      return [
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 0.8).toFixed(1)}" fill="${fill}" rx="2" />`,
        `<text x="${(x + barW / 2).toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="12.5" font-weight="${isLatest ? 700 : 400}" font-family="${FONT}" fill="${INK}">${escapeXml(bar.displayValue)}</text>`,
        `<text x="${(x + barW / 2).toFixed(1)}" y="${HEIGHT - 6}" text-anchor="middle" font-size="12" font-family="${FONT}" fill="${AXIS_TEXT}">${escapeXml(bar.label)}</text>`
      ].join("");
    })
    .join("");

  const zeroLine = `<line x1="${LEFT}" y1="${zeroY.toFixed(1)}" x2="${WIDTH - RIGHT}" y2="${zeroY.toFixed(1)}" stroke="#c7d4de" stroke-width="1" />`;
  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" role="img" aria-label="${escapeXml(chart.title)}" xmlns="http://www.w3.org/2000/svg">${zeroLine}${bars}</svg>`;
}

/** One small horizontal-bar panel per peer metric, Range highlighted. Values print beside each bar, so the bar is an aid, never the only source of the number. Negative values extend left of a zero line rather than being drawn as positive lengths. */
export function renderPeerPanelSvg(panel: PeerBarPanel): string {
  const WIDTH = 220;
  const ROW = 19;
  const LABEL_W = 40;
  const VALUE_W = 42;
  const TOP = 2;
  const HEIGHT = TOP + panel.bars.length * ROW + 2;
  const plotW = WIDTH - LABEL_W - VALUE_W;
  const values = panel.bars.map((b) => b.value);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const zeroX = LABEL_W + (-min / span) * plotW;

  const rows = panel.bars
    .map((bar, i) => {
      const y = TOP + i * ROW;
      const w = (Math.abs(bar.value) / span) * plotW;
      const x = bar.value >= 0 ? zeroX : zeroX - w;
      const fill = bar.value < 0 ? NEGATIVE : bar.isRange ? PRIMARY : MUTED_BAR;
      const weight = bar.isRange ? 700 : 400;
      const valueX = bar.value >= 0 ? zeroX + w + 4 : zeroX + 4;
      return [
        `<text x="${LABEL_W - 5}" y="${y + 13}" text-anchor="end" font-size="11" font-weight="${weight}" font-family="${FONT}" fill="${INK}">${escapeXml(bar.label)}</text>`,
        `<rect x="${x.toFixed(1)}" y="${y + 3}" width="${Math.max(w, 1).toFixed(1)}" height="${ROW - 6}" fill="${fill}" rx="2" />`,
        `<text x="${valueX.toFixed(1)}" y="${y + 13}" font-size="11" font-weight="${weight}" font-family="${FONT}" fill="${INK}">${escapeXml(bar.displayValue)}</text>`
      ].join("");
    })
    .join("");
  const zeroLine = min < 0 ? `<line x1="${zeroX.toFixed(1)}" y1="0" x2="${zeroX.toFixed(1)}" y2="${HEIGHT}" stroke="#8a9bab" stroke-width="1" />` : "";
  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" role="img" aria-label="${escapeXml(panel.title)}" xmlns="http://www.w3.org/2000/svg">${rows}${zeroLine}</svg>`;
}

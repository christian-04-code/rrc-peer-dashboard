const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "ChartWorkspace.tsx"), "utf8");

test("chart data points wire hover/focus handlers to a single reusable tooltip component", () => {
  assert.match(source, /function ChartPointTooltip/, "expected one reusable tooltip renderer, not per-metric duplication");
  const tooltipUsages = source.match(/<ChartPointTooltip/g) ?? [];
  assert.equal(tooltipUsages.length, 1, "ChartPointTooltip should be rendered from a single call site shared by every metric/series");
  assert.match(source, /onMouseEnter={\(\) => setHover\(point\)}/);
  assert.match(source, /onMouseLeave={\(\) => setHover/);
});

test("tooltip content includes ticker, period, exact value, and unit", () => {
  assert.match(source, /\$\{point\.ticker\}[^`]*point\.period/s);
  assert.match(source, /formatSeriesValue\(point\.value, seriesPrecision\)/);
  assert.match(source, /unit/);
});

test("historical series tooltips preserve each metric's approved source precision", () => {
  assert.match(source, /production:\s*\{[^}]*precision: 3/s);
  assert.match(source, /revenue:\s*\{[^}]*precision: 3/s);
  assert.match(source, /capex:\s*\{[^}]*precision: 0/s);
  assert.match(source, /debt:\s*\{[^}]*precision: 3/s);
  assert.match(source, /fcf:\s*\{[^}]*precision: 0/s);
  assert.match(source, /ebitdax:\s*\{[^}]*precision: 3/s);
  assert.match(source, /minimumFractionDigits: precision/);
  assert.match(source, /maximumFractionDigits: precision/);
});

test("Overview tooltips contain no modeled forecast point state or label", () => {
  assert.doesNotMatch(source, /point\.modeled|\bModeled\b|model-forecast/);
});

test("null values never render a circle/point (no fake tooltips for unsupported data)", () => {
  assert.match(source, /if \(value === null\) return null;/);
});

test("existing SVG structure and single-charting-library constraint are preserved while dashed styling belongs only to guidance", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
  assert.doesNotMatch(source, /from "recharts"|from "chart\.js"|from "d3"|from "victory"/);
  assert.doesNotMatch(source, /model-forecast-line|Internal Model Forecast/);
  assert.match(source, /management-guidance-line/);
  assert.match(css, /management-guidance-line[^}]*stroke-dasharray/);
  assert.match(source, /<svg/);
});

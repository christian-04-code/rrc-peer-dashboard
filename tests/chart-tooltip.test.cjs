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
  assert.match(source, /formatValue\(point\.value\)/);
  assert.match(source, /unit/);
});

test("modeled/forecast points are labeled Modeled, while historical actuals are not", () => {
  assert.match(source, /point\.modeled/);
  assert.match(source, /\bModeled\b/);
  assert.match(source, /modeled = index >= splitIndex/);
});

test("null values never render a circle/point (no fake tooltips for unsupported data)", () => {
  assert.match(source, /if \(value === null\) return null;/);
});

test("existing SVG structure, dashed forecast styling, and single-charting-library constraint are preserved", () => {
  assert.doesNotMatch(source, /from "recharts"|from "chart\.js"|from "d3"|from "victory"/);
  assert.match(source, /forecast-line/);
  assert.match(source, /<svg/);
});

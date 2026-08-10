const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const { getCompanyColor } = load("lib/dashboard/company-colors.ts");

const ALL_TICKERS = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];

test("every core ticker has a defined, distinct hex color", () => {
  const colors = ALL_TICKERS.map(getCompanyColor);
  for (const color of colors) {
    assert.match(color, /^#[0-9a-f]{6}$/i);
  }
  assert.equal(new Set(colors).size, colors.length, "every ticker should have a unique color");
});

test("required brand colors: RRC is blue, AR is green, EQT is pink", () => {
  assert.equal(getCompanyColor("RRC"), "#0081c6");
  assert.equal(getCompanyColor("AR"), "#74c7a2");
  assert.equal(getCompanyColor("EQT"), "#e98ca8");
});

test("color lookup is a pure function of ticker (stable regardless of call order/selection)", () => {
  assert.equal(getCompanyColor("CNX"), getCompanyColor("CNX"));
  const first = getCompanyColor("EXE");
  getCompanyColor("GPOR");
  getCompanyColor("RRC");
  assert.equal(getCompanyColor("EXE"), first);
});

test("ChartWorkspace assigns line/point/legend color from the ticker identity map, not seriesIndex", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "ChartWorkspace.tsx"), "utf8");
  assert.match(source, /getCompanyColor/);
  assert.doesNotMatch(source, /peer-\$\{Math\.min\(seriesIndex/, "must not color by series position anymore");
  assert.doesNotMatch(source, /"peer-line peer-\$/);
  // line, point, and legend box all read the same per-ticker color
  assert.match(source, /style=\{\{ stroke: color \}\}/);
  assert.match(source, /style=\{\{ fill: color \}\}/);
  assert.match(source, /getCompanyColor\(seriesTicker\)/);
});

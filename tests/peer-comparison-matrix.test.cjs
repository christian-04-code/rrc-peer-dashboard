const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const {
  calculateEvToEbitdax,
  calculateFcfYield,
  getActivePeerMetricRow,
  getPeerComparisonMatrix
} = load("lib/dashboard/peer-comparison-metrics.ts");

function findRow(matrix, key) {
  return matrix.groups.flatMap((group) => group.rows).find((row) => row.key === key);
}

test("selected ticker creates a matrix column", () => {
  assert.deepEqual(getPeerComparisonMatrix(["RRC"]).tickers, ["RRC"]);
});

test("multiple selected tickers preserve selection order and deselection removes the column", () => {
  assert.deepEqual(getPeerComparisonMatrix(["RRC", "EQT", "CNX"]).tickers, ["RRC", "EQT", "CNX"]);
  assert.deepEqual(getPeerComparisonMatrix(["RRC", "CNX"]).tickers, ["RRC", "CNX"]);
});

test("unsupported values format as double dash rather than zero", () => {
  const matrix = getPeerComparisonMatrix(["RRC", "AR"]);
  assert.equal(findRow(matrix, "eps").values.AR.value, null);
  assert.equal(findRow(matrix, "eps").values.AR.displayValue, "--");
});

test("chart metrics map to their corresponding matrix highlight row", () => {
  assert.equal(getActivePeerMetricRow("fcf"), "fcf");
  assert.equal(getActivePeerMetricRow("debt"), "netDebt");
  assert.equal(getActivePeerMetricRow("ebitdax"), "ebitdax");
});

test("calculated valuation ratios fail safely when any required input is missing or invalid", () => {
  assert.equal(calculateFcfYield(null, 1000), null);
  assert.equal(calculateFcfYield(100, null), null);
  assert.equal(calculateFcfYield(100, 0), null);
  assert.equal(calculateEvToEbitdax(1000, null, 500), null);
  assert.equal(calculateEvToEbitdax(1000, 200, 0), null);
});

test("RRC plus multiple peers produces all columns and responsive overflow styles", () => {
  const matrix = getPeerComparisonMatrix(["RRC", "AR", "EQT", "CNX"]);
  assert.equal(matrix.tickers.length, 4);
  for (const group of matrix.groups) {
    for (const row of group.rows) assert.deepEqual(Object.keys(row.values), matrix.tickers);
  }
  const css = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
  assert.match(css, /\.peer-matrix-scroll[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.peer-matrix th:first-child[^}]*position:\s*sticky/);
});

test("HomeDashboard passes the same selectedTickers and active metric to the matrix", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components", "HomeDashboard.tsx"), "utf8");
  assert.match(source, /<PeerComparisonMatrix selectedTickers=\{selectedTickers\} metric=\{metric\} \/>/);
});

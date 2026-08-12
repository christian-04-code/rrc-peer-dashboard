const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const {
  calculateEvToEbitdax,
  calculateFcfYield,
  DEFAULT_PEER_COMPARISON_QUARTER,
  getActivePeerMetricRow,
  getPeerComparisonMatrix,
  getPeerComparisonQuarters
} = load("lib/dashboard/peer-comparison-metrics.ts");

function findRow(matrix, key) {
  return matrix.groups.flatMap((group) => group.rows).find((row) => row.key === key);
}

test("selected ticker creates a matrix column", () => {
  assert.deepEqual(getPeerComparisonMatrix(["RRC"]).tickers, ["RRC"]);
});

test("quarter selector defaults to the latest canonical peer quarter and derives all options from that dataset", () => {
  assert.equal(DEFAULT_PEER_COMPARISON_QUARTER, "Q2 2026");
  assert.deepEqual(getPeerComparisonQuarters(), [
    "Q2 2026", "Q1 2026", "Q4 2025", "Q3 2025", "Q2 2025",
    "Q1 2025", "Q4 2024", "Q3 2024", "Q2 2024", "Q1 2024"
  ]);
});

test("changing the selected quarter updates every matrix value from that requested period", () => {
  const current = getPeerComparisonMatrix(["RRC"], "Q2 2026");
  const historical = getPeerComparisonMatrix(["RRC"], "Q4 2025");
  assert.equal(findRow(current, "production").values.RRC.value, 2296.399);
  assert.equal(findRow(historical, "production").values.RRC.value, 2316.485);
  assert.notEqual(findRow(current, "revenue").values.RRC.value, findRow(historical, "revenue").values.RRC.value);
});

test("multiple selected tickers preserve selection order and deselection removes the column", () => {
  assert.deepEqual(getPeerComparisonMatrix(["RRC", "EQT", "CNX"]).tickers, ["RRC", "EQT", "CNX"]);
  assert.deepEqual(getPeerComparisonMatrix(["RRC", "CNX"]).tickers, ["RRC", "CNX"]);
});

test("unsupported values format as double dash rather than falling back to another quarter", () => {
  const matrix = getPeerComparisonMatrix(["RRC", "GPOR"], "Q2 2026");
  assert.equal(findRow(matrix, "marketCap").values.RRC.value, null);
  assert.equal(findRow(matrix, "marketCap").values.RRC.displayValue, "--");
  assert.equal(findRow(matrix, "eps").values.GPOR.value, null);
  assert.equal(findRow(matrix, "eps").values.GPOR.displayValue, "--");
});

test("all 840 peer-quarter-metric cells are audited with only unsupported values left blank", () => {
  const tickers = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];
  const missingByMetric = {};
  let total = 0;
  let missing = 0;

  for (const quarter of getPeerComparisonQuarters()) {
    const matrix = getPeerComparisonMatrix(tickers, quarter);
    for (const row of matrix.groups.flatMap((group) => group.rows)) {
      for (const ticker of tickers) {
        total += 1;
        if (row.values[ticker].value === null) {
          missing += 1;
          missingByMetric[row.key] = (missingByMetric[row.key] ?? 0) + 1;
        }
      }
    }
  }

  assert.equal(total, 840);
  assert.equal(missing, 113);
  assert.deepEqual(missingByMetric, {
    netDebtToEbitdax: 21,
    fcfYield: 28,
    marketCap: 7,
    eps: 1,
    pe: 28,
    evToEbitdax: 28
  });
});

test("historical valuation and LTM metrics resolve at the selected quarter", () => {
  const q4 = getPeerComparisonMatrix(["RRC"], "Q4 2025");
  const q1 = getPeerComparisonMatrix(["RRC"], "Q1 2026");
  assert.equal(findRow(q4, "marketCap").values.RRC.value, 8410);
  assert.equal(findRow(q1, "marketCap").values.RRC.value, 10650);
  for (const key of ["netDebtToEbitdax", "fcfYield", "pe", "evToEbitdax"]) {
    assert.notEqual(findRow(q4, key).values.RRC.value, findRow(q1, key).values.RRC.value, `${key} must change with the selected trailing period`);
  }
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

test("matrix UI renders one quarter selector and no repeated source-period labels", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "PeerComparisonMatrix.tsx"), "utf8");
  assert.match(source, /<select aria-label="Matrix quarter"/);
  assert.doesNotMatch(source, /Values show source period/);
  assert.doesNotMatch(source, /cell\.period|Unsupported<\/small>/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

function load(relativePath) {
  const filename = path.resolve(process.cwd(), relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: filename
  }).outputText;

  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(output, filename);
  return loaded.exports;
}

const { getQuarterlyFinancials, getAllQuartersForTicker, quarters } = load("lib/dashboard/financials-quarterly.ts");

test("RRC preserves its supporting balance-sheet fields for the original nine-quarter dataset", () => {
  for (const quarter of quarters.filter((quarter) => quarter !== "Q2 2026")) {
    const row = getQuarterlyFinancials("RRC", quarter);
    for (const field of ["netIncome", "operatingCashFlow", "cashAndEquivalents", "totalDebt"]) {
      assert.ok(row[field], `RRC ${quarter} is missing ${field}`);
      assert.equal(typeof row[field].value, "number", `RRC ${quarter} ${field}.value should be a number, got ${row[field].value}`);
      assert.ok(Number.isFinite(row[field].value), `RRC ${quarter} ${field}.value should be finite`);
    }
  }
});

test("RRC netIncome is sourced from FactSet; operatingCashFlow, cashAndEquivalents, and totalDebt are sourced from Codex", () => {
  const q1_2026 = getQuarterlyFinancials("RRC", "Q1 2026");
  assert.equal(q1_2026.netIncome.source, "factset");
  assert.equal(q1_2026.operatingCashFlow.source, "codex");
  assert.equal(q1_2026.cashAndEquivalents.source, "codex");
  assert.equal(q1_2026.totalDebt.source, "codex");
});

test("cashAndEquivalents and totalDebt are quarter-end balance-sheet point-in-time values matching the figures netDebt was already derived from", () => {
  // Cross-check against RRC's pre-existing netDebt (face-value debt less cash), which predates this change,
  // to confirm the newly added balance-sheet fields are the same underlying figures, not fabricated or re-derived.
  const q1_2024 = getQuarterlyFinancials("RRC", "Q1 2024");
  assert.equal(q1_2024.totalDebt.value - q1_2024.cashAndEquivalents.value, q1_2024.netDebt.value);

  const q1_2026 = getQuarterlyFinancials("RRC", "Q1 2026");
  assert.equal(q1_2026.totalDebt.value - q1_2026.cashAndEquivalents.value, q1_2026.netDebt.value);
});

test("non-RRC tickers do not have the four new fields fabricated -- they remain undefined, not zero or copied from RRC", () => {
  for (const ticker of ["AR", "CNX", "CRK", "EQT", "EXE", "GPOR"]) {
    const rows = getAllQuartersForTicker(ticker);
    assert.equal(rows.length, 10, `${ticker} should have 10 quarters through Q2 2026`);
    for (const row of rows) {
      assert.equal(row.netIncome, undefined, `${ticker} ${row.quarter} netIncome should remain unset`);
      assert.equal(row.operatingCashFlow, undefined, `${ticker} ${row.quarter} operatingCashFlow should remain unset`);
      assert.equal(row.cashAndEquivalents, undefined, `${ticker} ${row.quarter} cashAndEquivalents should remain unset`);
      assert.equal(row.totalDebt, undefined, `${ticker} ${row.quarter} totalDebt should remain unset`);
    }
  }
});

test("remaining priority peers add only the approved Q2 2026 actuals and preserve Q1 2026", () => {
  const approved = {
    AR: { q1: [3852, 1945.126, 252, 2686.5, 723.418], q2: [4144, 1559.842, 326, 2634.7, 595.437] },
    CNX: { q1: [1693.333333333333, 786.654, 170, 2375.08, 400], q2: [1664.8, 618.484, 142, 2239.488, 290] },
    CRK: { q1: [1087.988888888889, 587.354, 417.102, 2971.095, 251.265], q2: [1242.879, 470.262, 446.869, 3088.872, 244.811] },
    EQT: { q1: [6863.322222222222, 3378.736, 607.836, 5709.889, 2679.045], q2: [6972.242, 1809.94, 666.258, 5542.851, 1202.99] },
    EXE: { q1: [7436, 4397, 716, 2805, 1968], q2: [7482, 2960, 851, 3075, 1183] },
    GPOR: { q1: [997, 437.532, 121.7, 829.079, 264.2], q2: [962.8, 323.228, 148.6, 928.946, 179.1] }
  };

  const values = (row) => [
    row.production.total.value,
    row.revenue.value,
    row.capitalExpenditures.value,
    row.netDebt.value,
    row.adjustedEbitdax.value
  ];

  for (const [ticker, expected] of Object.entries(approved)) {
    const q1 = getQuarterlyFinancials(ticker, "Q1 2026");
    const q2 = getQuarterlyFinancials(ticker, "Q2 2026");
    assert.deepEqual(values(q1), expected.q1, `${ticker} Q1 2026 must remain unchanged`);
    assert.deepEqual(values(q2), expected.q2, `${ticker} Q2 2026 must match the approved audit`);
    for (const field of [q2.production.total, q2.revenue, q2.capitalExpenditures, q2.netDebt, q2.adjustedEbitdax]) {
      assert.notEqual(field.basis, "guidance", `${ticker} Q2 2026 must be historical, not guidance`);
      assert.equal(field.source, "codex");
    }
  }
});

test("duplicated historical JSON stores the approved Q2 values and omits CRK FCF", () => {
  const historical = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "data/historical.json"), "utf8"));
  const approved = {
    AR: [4144, 1559.842, 219.759, 326, 2634.7, 595.437],
    CNX: [1664.8, 618.484, 138, 142, 2239.488, 290],
    CRK: [1242.879, 470.262, undefined, 446.869, 3088.872, 244.811],
    EQT: [6972.242, 1809.94, 329.666, 666.258, 5542.851, 1202.99],
    EXE: [7482, 2960, 343, 851, 3075, 1183],
    GPOR: [962.8, 323.228, 6.4, 148.6, 928.946, 179.1]
  };
  const metrics = ["Total Production", "Revenue", "Free Cash Flow", "Capital Expenditures", "Net Debt", "Adjusted EBITDAX"];

  for (const [ticker, values] of Object.entries(approved)) {
    const stored = metrics.map((metric) => historical.companies[ticker].metrics[metric].values["Q2 2026"]);
    assert.deepEqual(stored, values);
  }
  assert.equal(Object.hasOwn(historical.companies.CRK.metrics["Free Cash Flow"].values, "Q2 2026"), false);
});

test("RRC adds only the accepted Q2 2026 actuals and preserves Q1 2026", () => {
  const rows = getAllQuartersForTicker("RRC");
  assert.equal(rows.length, 10);
  const q1_2026 = getQuarterlyFinancials("RRC", "Q1 2026");
  assert.equal(q1_2026.revenue.value, 1034.17);
  assert.equal(q1_2026.adjustedEbitdax.value, 569.529);
  assert.equal(q1_2026.capitalExpenditures.value, 139.0);
  assert.equal(q1_2026.netDebt.value, 833.753);

  const q2_2026 = getQuarterlyFinancials("RRC", "Q2 2026");
  assert.equal(q2_2026.quarter, "Q2 2026");
  assert.equal(q2_2026.production.total.value, 2296.399);
  assert.equal(q2_2026.revenue.value, 833.571);
  assert.equal(q2_2026.adjustedEbitdax.value, 349.059);
  assert.equal(q2_2026.capitalExpenditures.value, 222.0);
  assert.equal(q2_2026.netDebt.value, 880.753);
  assert.equal(q2_2026.production.total.basis, "actual");
  assert.equal(q2_2026.revenue.basis, "actual");
  assert.equal(q2_2026.adjustedEbitdax.basis, "actual");
  assert.equal(q2_2026.capitalExpenditures.basis, "actual");

  assert.notEqual(q2_2026.revenue.value, 1867.741, "six-month YTD revenue must not be stored as standalone Q2");
  assert.notEqual(q2_2026.production.total.value, 2252.163, "six-month average production must not replace standalone Q2");
  assert.match(q2_2026.capitalExpenditures.note, /company-reported all-in capital spending/);
  assert.doesNotMatch(q2_2026.capitalExpenditures.note, /cash additions plus/);
});

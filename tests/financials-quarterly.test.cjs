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

test("RRC has netIncome, operatingCashFlow, cashAndEquivalents, and totalDebt populated for all 9 quarters", () => {
  for (const quarter of quarters) {
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
    assert.equal(rows.length, 9, `${ticker} should still have 9 quarters`);
    for (const row of rows) {
      assert.equal(row.netIncome, undefined, `${ticker} ${row.quarter} netIncome should remain unset`);
      assert.equal(row.operatingCashFlow, undefined, `${ticker} ${row.quarter} operatingCashFlow should remain unset`);
      assert.equal(row.cashAndEquivalents, undefined, `${ticker} ${row.quarter} cashAndEquivalents should remain unset`);
      assert.equal(row.totalDebt, undefined, `${ticker} ${row.quarter} totalDebt should remain unset`);
    }
  }
});

test("RRC still has exactly 9 quarters and existing metrics (revenue, EBITDAX, capex, netDebt) are untouched", () => {
  const rows = getAllQuartersForTicker("RRC");
  assert.equal(rows.length, 9);
  const q1_2026 = getQuarterlyFinancials("RRC", "Q1 2026");
  assert.equal(q1_2026.revenue.value, 1034.17);
  assert.equal(q1_2026.adjustedEbitdax.value, 569.529);
  assert.equal(q1_2026.capitalExpenditures.value, 139.0);
  assert.equal(q1_2026.netDebt.value, 833.753);
});

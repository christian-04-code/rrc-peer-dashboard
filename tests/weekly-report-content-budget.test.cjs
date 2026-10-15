const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { STANDARD_BUDGET, REDUCED_BUDGET, MAX_PDF_PAGES, budgetForTier } = load("lib/reports/render/content-budget.ts");

test("budgetForTier returns STANDARD_BUDGET for 'standard' and REDUCED_BUDGET for 'reduced'", () => {
  assert.equal(budgetForTier("standard"), STANDARD_BUDGET);
  assert.equal(budgetForTier("reduced"), REDUCED_BUDGET);
});

test("every REDUCED_BUDGET cap is <= its STANDARD_BUDGET counterpart -- the reduced pass never allows MORE content", () => {
  for (const key of Object.keys(STANDARD_BUDGET)) {
    if (key === "tier" || key === "textTrim") continue;
    assert.ok(REDUCED_BUDGET[key] <= STANDARD_BUDGET[key], `REDUCED_BUDGET.${key} (${REDUCED_BUDGET[key]}) must be <= STANDARD_BUDGET.${key} (${STANDARD_BUDGET[key]})`);
  }
});

test("only the reduced tier trims text, and it never drops risk rows (five-page layout, 2026-10-14)", () => {
  assert.equal(STANDARD_BUDGET.textTrim, null);
  assert.ok(REDUCED_BUDGET.textTrim);
  assert.equal(REDUCED_BUDGET.maxRiskRows, STANDARD_BUDGET.maxRiskRows);
});

test("MAX_PDF_PAGES is the documented hard maximum of 5", () => {
  assert.equal(MAX_PDF_PAGES, 5);
});

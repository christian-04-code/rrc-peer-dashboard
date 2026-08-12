const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const { getQuarterlyFinancials, quarters } = load("lib/dashboard/financials-quarterly.ts");
const { getQuarterlyFreeCashFlow } = load("lib/dashboard/free-cash-flow-quarterly.ts");
const { getQuarterlyMarketCap } = load("lib/dashboard/market-cap-quarterly.ts");

const historical = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data", "historical.json"), "utf8")
);

const TICKERS = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];

/**
 * Canonical consistency guardrail (fix/q2-data-foundation, Phase A4).
 *
 * data/historical.json ("Layer 1 Historical Truth") and the live lib/dashboard/*.ts
 * fixtures are two independently hand-maintained copies of the same underlying
 * numbers, with no automated cross-check between them -- flagged as a structural
 * risk (H3) in the prior production audit. This test compares the two live sources
 * directly (no third manually-maintained "approved" array) for every metric they
 * both carry, so future edits to either file that silently drift from the other are
 * caught in CI instead of discovered by a user.
 *
 * SCOPE: Q2 2026 only. An exploratory sweep across all 10 quarters while building
 * this test found 272 pre-existing mismatches between historical.json and the live
 * fixtures across Q1 2024-Q1 2026 (the historical backfill that predates this
 * branch) -- exactly the kind of undocumented drift H3 warned about, but reconciling
 * two-plus years of quarterly filings for 7 companies is a separate effort, out of
 * scope for the Q2 2026 data-foundation work this branch performed. Q2 2026 itself
 * has zero mismatches (verified below) because every value in both files was sourced
 * and computed together in this branch. Restricting enforcement to Q2 2026 for now
 * means the guardrail actually passes and catches real *new* drift, rather than
 * either failing permanently on pre-existing history or silently covering it up by
 * loosening tolerances until everything passes.
 */
const CHECK_QUARTER = "Q2 2026";
const TOLERANCE = 1e-6;

function closeEnough(a, b) {
  return Math.abs(a - b) <= Math.max(TOLERANCE, Math.abs(a) * TOLERANCE);
}

const METRIC_CHECKS = [
  { key: "Revenue", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).revenue.value },
  { key: "Adjusted EBITDAX", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).adjustedEbitdax.value },
  { key: "Capital Expenditures", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).capitalExpenditures.value },
  { key: "Net Debt", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).netDebt.value },
  { key: "Total Production", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).production.total.value },
  { key: "Natural Gas Production", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).production.naturalGas.value },
  { key: "NGL Production", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).production.ngl.value },
  { key: "Oil / Condensate Production", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).production.oilCondensate.value },
  { key: "Realized Natural Gas Price", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).realizedPrices.naturalGas.value },
  { key: "Realized NGL Price", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).realizedPrices.ngl.value },
  { key: "Realized Oil / Condensate Price", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).realizedPrices.oilCondensate.value },
  { key: "Lease Operating Expense (LOE)", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).costs.leaseOperatingExpense.value },
  { key: "Gathering / Processing / Transportation", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).costs.gatheringProcessingTransportation.value },
  { key: "Cash G&A", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).costs.cashGA.value },
  { key: "Total Cash Unit Costs", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).costs.totalCashUnitCosts.value },
  { key: "Wells Drilled", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).wells.drilled.value },
  { key: "Wells Turned-in-Line (TIL)", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).wells.turnedInLine.value },
  { key: "DUC Inventory", read: (t) => getQuarterlyFinancials(t, CHECK_QUARTER).wells.ducInventory.value },
  { key: "Free Cash Flow", read: (t) => getQuarterlyFreeCashFlow(t, CHECK_QUARTER).value }
];

test(`historical.json and the live dashboard fixtures agree on every shared ticker/metric at ${CHECK_QUARTER}`, () => {
  let compared = 0;

  for (const { key, read } of METRIC_CHECKS) {
    for (const ticker of TICKERS) {
      const historicalMetric = historical.companies[ticker]?.metrics?.[key];
      assert.ok(historicalMetric, `data/historical.json is missing the "${key}" metric for ${ticker}`);

      const historicalValue = historicalMetric.values[CHECK_QUARTER] ?? null;
      const liveValue = read(ticker) ?? null;

      // Both sources are allowed to independently agree that a cell is unsupported --
      // that is a legitimate shared state, not drift.
      if (historicalValue === null && liveValue === null) continue;

      assert.ok(
        historicalValue !== null && liveValue !== null,
        `${ticker} ${key} ${CHECK_QUARTER}: one source has a value and the other doesn't ` +
          `(historical.json=${historicalValue}, live fixture=${liveValue}) -- ` +
          `either backfill the missing side or document why they diverge.`
      );

      compared += 1;
      assert.ok(
        closeEnough(historicalValue, liveValue),
        `${ticker} ${key} ${CHECK_QUARTER}: historical.json (${historicalValue}) and the live ` +
          `dashboard fixture (${liveValue}) disagree by ${Math.abs(historicalValue - liveValue)}.`
      );
    }
  }

  // A sanity floor, not a magic number: fails loudly if a future refactor accidentally
  // makes every read() return null (e.g. a renamed field), which would otherwise let
  // this test pass vacuously with 0 real comparisons.
  assert.ok(compared >= 100, `expected at least 100 real historical.json/live comparisons at ${CHECK_QUARTER}, got ${compared}`);
});

test(`historical.json's Equity Market Capitalization normalization input agrees with market-cap-quarterly.ts at ${CHECK_QUARTER}`, () => {
  for (const ticker of TICKERS) {
    const historicalValue = historical.companies[ticker]?.normalization_inputs?.["Equity Market Capitalization"]?.values?.[CHECK_QUARTER] ?? null;
    const liveValue = getQuarterlyMarketCap(ticker, CHECK_QUARTER)?.value ?? null;
    assert.ok(historicalValue !== null, `data/historical.json is missing Equity Market Capitalization for ${ticker} ${CHECK_QUARTER}`);
    assert.ok(liveValue !== null, `market-cap-quarterly.ts is missing a value for ${ticker} ${CHECK_QUARTER}`);
    assert.ok(
      closeEnough(historicalValue, liveValue),
      `${ticker} Equity Market Capitalization ${CHECK_QUARTER}: historical.json (${historicalValue}) and market-cap-quarterly.ts (${liveValue}) disagree.`
    );
  }
});

test("the latest canonical quarter checked here matches the live fixture's own latest quarter", () => {
  assert.equal(quarters.at(-1), CHECK_QUARTER);
});

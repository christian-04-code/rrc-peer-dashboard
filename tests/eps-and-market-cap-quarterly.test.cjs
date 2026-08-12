const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { getQuarterlyEps } = load("lib/dashboard/eps-quarterly.ts");
const { getQuarterlyMarketCap } = load("lib/dashboard/market-cap-quarterly.ts");
const { quarters } = load("lib/dashboard/financials-quarterly.ts");

test("FactSet actual EPS is populated for every supported core peer quarter", () => {
  for (const ticker of ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"]) {
    for (const quarter of quarters) {
      const eps = getQuarterlyEps(ticker, quarter);
      if (ticker === "GPOR" && quarter === "Q2 2026") {
        assert.equal(eps, undefined, "GPOR Q2 2026 is #N/A in the source workbook");
        continue;
      }
      assert.ok(eps, `${ticker} ${quarter} EPS should be present`);
      assert.equal(eps.source, "factset");
      assert.ok(Number.isFinite(eps.value));
    }
  }
});

test("representative peer EPS values match the FactSet actual rows exactly", () => {
  assert.equal(getQuarterlyEps("AR", "Q1 2024").value, 0.070755);
  assert.equal(getQuarterlyEps("CRK", "Q2 2026").value, 0.03);
  assert.equal(getQuarterlyEps("EXE", "Q4 2025").value, 2);
});

test("Market cap is populated for every core peer ticker across all 10 quarters", () => {
  for (const ticker of ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"]) {
    for (const quarter of quarters) {
      const marketCap = getQuarterlyMarketCap(ticker, quarter);
      assert.ok(marketCap, `${ticker} ${quarter} market cap should be present`);
      assert.ok(Number.isFinite(marketCap.value) && marketCap.value > 0);
    }
  }
});

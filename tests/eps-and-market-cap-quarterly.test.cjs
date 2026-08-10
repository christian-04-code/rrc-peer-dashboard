const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { getQuarterlyEps } = load("lib/dashboard/eps-quarterly.ts");
const { getQuarterlyMarketCap } = load("lib/dashboard/market-cap-quarterly.ts");
const { quarters } = load("lib/dashboard/financials-quarterly.ts");

test("RRC EPS is populated for all 9 quarters and sourced from FactSet", () => {
  for (const quarter of quarters) {
    const eps = getQuarterlyEps("RRC", quarter);
    assert.ok(eps, `RRC ${quarter} EPS should be present`);
    assert.equal(eps.source, "factset");
    assert.ok(Number.isFinite(eps.value));
  }
});

test("EPS is not fabricated for tickers other than RRC", () => {
  for (const ticker of ["AR", "CNX", "CRK", "EQT", "EXE", "GPOR"]) {
    assert.equal(getQuarterlyEps(ticker, "Q1 2026"), undefined);
  }
});

test("Market cap is populated for every core peer ticker across all 9 quarters", () => {
  for (const ticker of ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"]) {
    for (const quarter of quarters) {
      const marketCap = getQuarterlyMarketCap(ticker, quarter);
      assert.ok(marketCap, `${ticker} ${quarter} market cap should be present`);
      assert.ok(Number.isFinite(marketCap.value) && marketCap.value > 0);
    }
  }
});

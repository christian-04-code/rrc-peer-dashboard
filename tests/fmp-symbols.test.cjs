const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { FMP_COMMODITY_SYMBOLS, FMP_EQUITY_TICKERS } = load("lib/fmp/symbols.ts");

test("commodity symbols are exactly the FMP-verified values, not a guess", () => {
  assert.equal(FMP_COMMODITY_SYMBOLS.wti, "CLUSD");
  assert.equal(FMP_COMMODITY_SYMBOLS.henryHub, "NGUSD");
});

test("equity tickers cover all 7 core peers, no more, no fewer", () => {
  assert.deepEqual(
    [...FMP_EQUITY_TICKERS].sort(),
    ["AR", "CNX", "CRK", "EQT", "EXE", "GPOR", "RRC"]
  );
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { FINNHUB_EQUITY_TICKERS } = load("lib/finnhub/symbols.ts");

test("Finnhub equity tickers cover all 7 core peers, no more, no fewer", () => {
  assert.deepEqual([...FINNHUB_EQUITY_TICKERS].sort(), ["AR", "CNX", "CRK", "EQT", "EXE", "GPOR", "RRC"]);
});

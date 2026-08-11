const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const { getOverviewSummaryCards } = load("lib/dashboard/overview-metrics.ts");

function sharePriceCard(ticker, liveSharePrice) {
  return getOverviewSummaryCards(ticker, liveSharePrice).find((card) => card.key === "share_price");
}

test("a valid live Finnhub share price renders as the current price with a Finnhub current-market source note", () => {
  const card = sharePriceCard("RRC", { value: 24.37, note: "Finnhub · current market (RRC)" });
  assert.equal(card.displayValue, "$24.37");
  assert.equal(card.note, "Finnhub · current market (RRC)");
});

test("no live share price supplied (undefined, still loading) renders '--', never a fabricated value", () => {
  const card = sharePriceCard("RRC", undefined);
  assert.equal(card.displayValue, "--");
  assert.equal(card.note, "Finnhub · current market");
});

test("a live share price object with value: null (quote unavailable) also renders '--', not 0", () => {
  const card = sharePriceCard("GPOR", { value: null, note: "Finnhub · current market" });
  assert.equal(card.displayValue, "--");
  assert.notEqual(card.displayValue, "$0.00");
});

test("every one of the 7 core tickers resolves a share-price card keyed to that ticker's own live quote", () => {
  const tickers = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];
  for (const [index, ticker] of tickers.entries()) {
    const card = sharePriceCard(ticker, { value: 10 + index, note: `Finnhub · current market (${ticker})` });
    assert.equal(card.displayValue, `$${(10 + index).toFixed(2)}`);
    assert.match(card.note, new RegExp(ticker));
  }
});

test("share price never overwrites the other reported-quarter Overview cards (production/revenue/EBITDAX/FCF/net debt untouched)", () => {
  const withLive = getOverviewSummaryCards("RRC", { value: 24.37, note: "Finnhub · current market" });
  const withoutLive = getOverviewSummaryCards("RRC", undefined);
  for (const key of ["production", "revenue", "ebitdax", "free_cash_flow", "net_debt"]) {
    const a = withLive.find((c) => c.key === key);
    const b = withoutLive.find((c) => c.key === key);
    assert.deepEqual(a, b, `${key} card should be identical regardless of live share price`);
  }
});

test("HomeDashboard recomputes the live share price per focused ticker and wires it through getOverviewSummaryCards using Finnhub", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components", "HomeDashboard.tsx"), "utf8");
  assert.match(source, /useFinnhubQuotes/);
  assert.match(source, /finnhubQuotes\.data\?\.equities\[focusedTicker\]/);
  assert.match(source, /getOverviewSummaryCards\(focusedTicker, liveSharePrice\)/);
  // useMemo dependency arrays include `focusedTicker` so changing detail context updates the price.
  assert.match(source, /}, \[finnhubQuotes\.data, focusedTicker\]\)/);
  // FMP must no longer be part of the active Overview share-price path.
  assert.doesNotMatch(source, /useFmpQuotes/);
});

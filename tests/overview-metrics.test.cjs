const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const { quarters } = load("lib/dashboard/financials-quarterly.ts");
const { getOverviewSummaryCards } = load("lib/dashboard/overview-metrics.ts");

const tickers = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];
const liveSharePrices = Object.fromEntries(tickers.map((ticker, index) => [
  ticker,
  { value: 10 + index, note: `Finnhub · current market (${ticker})` }
]));

function card(ticker, key) {
  return getOverviewSummaryCards(ticker, liveSharePrices[ticker], liveSharePrices).find((item) => item.key === key);
}

test("the canonical reported-quarter sequence rolls forward to Q2 2026", () => {
  assert.equal(quarters.at(-1), "Q2 2026");
});

test("all seven peers render ten Overview cards with Q2 fundamentals and compact ranks", () => {
  for (const ticker of tickers) {
    const cards = getOverviewSummaryCards(ticker, liveSharePrices[ticker], liveSharePrices);
    assert.equal(cards.length, 10);
    for (const key of ["production", "revenue", "ebitdax", "free_cash_flow", "net_debt", "capex", "net_debt_to_ebitdax"]) {
      assert.match(cards.find((item) => item.key === key).note, /Q2 2026/);
    }
    for (const item of cards.filter((candidate) => candidate.key !== "lateral_feet_til")) {
      if (item.displayValue !== "--") assert.ok(item.rank >= 1 && item.rank <= 7, `${ticker} ${item.key} should have a peer rank`);
    }
  }
});

test("realized gas uses the latest complete comparable period and lateral feet is not inferred", () => {
  for (const ticker of tickers) {
    assert.match(card(ticker, "realized_gas_price").note, /Q1 2026/);
    assert.notEqual(card(ticker, "realized_gas_price").displayValue, "--");
    assert.equal(card(ticker, "lateral_feet_til").displayValue, "--");
    assert.equal(card(ticker, "lateral_feet_til").rank, null);
  }
});

test("rank direction follows the requested ordering and updates with focused company", () => {
  assert.equal(card("GPOR", "share_price").rank, 1);
  assert.equal(card("RRC", "share_price").rank, 7);
  const netDebtRanks = tickers.map((ticker) => ({ ticker, rank: card(ticker, "net_debt").rank }));
  assert.equal(netDebtRanks.find(({ rank }) => rank === 1).ticker, "RRC");
});

test("removed Overview copy is absent from rendered components", () => {
  const files = ["components/HomeDashboard.tsx", "components/dashboard/CompanyHero.tsx", "components/dashboard/ChartWorkspace.tsx"];
  const source = files.map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8")).join("\n");
  for (const removed of [
    "Interactive energy research workspace",
    "Live market & verified company data",
    "Only explicitly disclosed periods are shown",
    "— dashed",
    "Market prices reflect current provider observations where available."
  ]) assert.doesNotMatch(source, new RegExp(removed));
  assert.match(source, /Interactive Peer Dashboard/);
});

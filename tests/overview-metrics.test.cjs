const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const { quarters, getQuarterlyFinancials } = load("lib/dashboard/financials-quarterly.ts");
const { getOverviewSummaryCards } = load("lib/dashboard/overview-metrics.ts");
const { getLtmAdjustedEbitdax, getNetDebtToLtmAdjustedEbitdax } = load("lib/dashboard/calculated-quarterly.ts");

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

test("realized gas resolves at Q2 2026 for every peer now that the Q2 2026 detail fields are populated, and lateral feet is not inferred", () => {
  for (const ticker of tickers) {
    assert.match(card(ticker, "realized_gas_price").note, /Q2 2026/);
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

test("Net Debt / LTM EBITDAX uses trailing-four-quarter EBITDAX, not a single quarter's EBITDAX", () => {
  for (const ticker of tickers) {
    const single = card(ticker, "net_debt_to_ebitdax");
    assert.match(single.label, /LTM/);
    const netDebt = getQuarterlyFinancials(ticker, "Q2 2026").netDebt.value;
    const ltmEbitdax = getLtmAdjustedEbitdax(ticker, "Q2 2026").value;
    const expected = netDebt === null || ltmEbitdax === null || ltmEbitdax === 0 ? null : netDebt / ltmEbitdax;
    if (expected === null) {
      assert.equal(single.displayValue, "--");
    } else {
      const singleQuarterEbitdax = getQuarterlyFinancials(ticker, "Q2 2026").adjustedEbitdax.value;
      const buggyValue = netDebt / singleQuarterEbitdax;
      assert.notEqual(Number(single.displayValue.replace(/[^0-9.-]/g, "")), Number(buggyValue.toFixed(1)));
      assert.equal(Number(single.displayValue.replace("x", "")), Number(expected.toFixed(1)));
    }
  }
});

test("Overview Net Debt / LTM EBITDAX matches getNetDebtToLtmAdjustedEbitdax directly for every peer", () => {
  for (const ticker of tickers) {
    const expected = getNetDebtToLtmAdjustedEbitdax(ticker, "Q2 2026").value;
    const actual = card(ticker, "net_debt_to_ebitdax").displayValue;
    assert.equal(actual, expected === null ? "--" : `${expected.toFixed(1)}x`);
  }
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

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const { quarters, getQuarterlyFinancials } = load("lib/dashboard/financials-quarterly.ts");
const { getOverviewSummaryCards } = load("lib/dashboard/overview-metrics.ts");
const { getLtmAdjustedEbitdax, getNetDebtToLtmAdjustedEbitdax, getRealizedPricePerMcfe } = load("lib/dashboard/calculated-quarterly.ts");
const { getPeerComparisonMatrix } = load("lib/dashboard/peer-comparison-metrics.ts");

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
    for (const key of ["production", "revenue", "ebitdax", "free_cash_flow", "net_debt", "capex", "net_debt_to_ebitdax", "realized_price_per_mcfe"]) {
      assert.match(cards.find((item) => item.key === key).note, /Q2 2026/);
    }
    for (const item of cards.filter((candidate) => candidate.key !== "wells_drilled")) {
      if (item.displayValue !== "--") assert.ok(item.rank >= 1 && item.rank <= 7, `${ticker} ${item.key} should have a peer rank`);
    }
  }
});

test("the Lateral Feet TIL card no longer exists; Wells Drilled has taken its place", () => {
  for (const ticker of tickers) {
    const cards = getOverviewSummaryCards(ticker, liveSharePrices[ticker], liveSharePrices);
    assert.equal(cards.find((item) => item.key === "lateral_feet_til"), undefined);
    assert.equal(cards.find((item) => item.label === "Lateral Feet TIL"), undefined);
    assert.ok(cards.find((item) => item.key === "wells_drilled"));
  }
});

test("the Realized Natural Gas Price card no longer exists; Realized Price ($/Mcfe) has taken its place", () => {
  for (const ticker of tickers) {
    const cards = getOverviewSummaryCards(ticker, liveSharePrices[ticker], liveSharePrices);
    assert.equal(cards.find((item) => item.key === "realized_gas_price"), undefined);
    assert.equal(cards.find((item) => item.label === "Realized Natural Gas Price"), undefined);
    const realizedPriceCard = card(ticker, "realized_price_per_mcfe");
    assert.equal(realizedPriceCard.label, "Realized Price");
    assert.ok(realizedPriceCard.displayValue === "--" || /\/Mcfe$/.test(realizedPriceCard.displayValue));
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

test("Overview Realized Price uses the same canonical helper as Peer Comparison, not a second implementation", () => {
  for (const ticker of tickers) {
    const overviewValue = card(ticker, "realized_price_per_mcfe").displayValue;
    const helperValue = getRealizedPricePerMcfe(ticker, "Q2 2026").value;
    const matrixValue = getPeerComparisonMatrix([ticker], "Q2 2026").groups
      .flatMap((group) => group.rows)
      .find((row) => row.key === "realizedPricePerMcfe").values[ticker].value;
    assert.equal(helperValue, matrixValue, `${ticker}: Overview and Peer Comparison must read the same helper`);
    assert.equal(overviewValue, helperValue === null ? "--" : `$${helperValue.toFixed(2)}/Mcfe`);
  }
});

test("CRK Realized Price remains unavailable on Overview (never 0.00), consistent with Peer Comparison", () => {
  assert.equal(card("CRK", "realized_price_per_mcfe").displayValue, "--");
  assert.notEqual(card("CRK", "realized_price_per_mcfe").displayValue, "$0.00/Mcfe");
  assert.equal(card("CRK", "realized_price_per_mcfe").rank, null);
});

test("Realized Price rank uses the standardized blended metric, not the old gas-only price", () => {
  // AR's blended $/Mcfe (from realized-price-per-mcfe.test data) outranks RRC's at Q2 2026
  // even though this is not asserting a specific rank number -- the key guard is that the
  // rank is computed from realizedPricePerMcfeValues, not a resurrected gas-only series.
  const values = tickers.map((ticker) => ({ ticker, value: getRealizedPricePerMcfe(ticker, "Q2 2026").value }));
  for (const ticker of tickers) {
    const cardRank = card(ticker, "realized_price_per_mcfe").rank;
    const value = values.find((item) => item.ticker === ticker).value;
    if (value === null) { assert.equal(cardRank, null); continue; }
    const comparable = values.filter((item) => item.value !== null);
    const expectedRank = 1 + comparable.filter((item) => item.value > value).length;
    assert.equal(cardRank, expectedRank, `${ticker}: rank should follow blended $/Mcfe ordering`);
  }
});

test("Wells Drilled resolves the latest verified standalone quarter per company, never estimating", () => {
  // CNX and CRK have verified Q2 2026 wells-drilled disclosures.
  assert.equal(card("CNX", "wells_drilled").displayValue, "2");
  assert.match(card("CNX", "wells_drilled").note, /Q2 2026/);
  assert.equal(card("CRK", "wells_drilled").displayValue, "17");
  assert.match(card("CRK", "wells_drilled").note, /Q2 2026/);
});

test("Wells Drilled never substitutes GPOR's Q2 2026 spud count (10-Q says 'spud', not 'drilled')", () => {
  const gpor = card("GPOR", "wells_drilled");
  assert.equal(gpor.displayValue, "8");
  assert.match(gpor.note, /Q1 2026/);
  assert.doesNotMatch(gpor.note, /Q2 2026/);
});

test("Wells Drilled treats RRC as unavailable because its stored values contradict their own source note", () => {
  const rrc = card("RRC", "wells_drilled");
  assert.equal(rrc.displayValue, "--");
  assert.equal(rrc.note, "No verified reported value");
  assert.equal(rrc.rank, null);
});

test("Wells Drilled ranking excludes unavailable peers rather than treating them as zero", () => {
  // At Q2 2026, only CNX, CRK, EXE, and GPOR have a verified standalone wells-drilled
  // quarter to rank; RRC (contradictory source), AR, and EQT (no disclosure at all) are
  // excluded from the comparable set rather than counted as zero.
  const ranks = tickers.map((ticker) => ({ ticker, rank: card(ticker, "wells_drilled").rank })).filter((item) => item.rank !== null);
  assert.deepEqual(ranks.map((item) => item.ticker).sort(), ["CNX", "CRK", "EXE", "GPOR"]);
  const rankValues = ranks.map((item) => item.rank).sort((a, b) => a - b);
  assert.deepEqual(rankValues, [1, 2, 3, 4]);
});

test("Realized Price tooltip uses the exact required wording", () => {
  const definition = card("RRC", "realized_price_per_mcfe").definition;
  assert.equal(definition, "Blended pre-hedge realized commodity price across natural gas, NGLs, and oil/condensate per Mcfe of total production.");
});

test("Wells Drilled tooltip surfaces the specific company source caveat where one exists, and the generic definition otherwise", () => {
  const cnx = card("CNX", "wells_drilled");
  assert.match(cnx.definition, /^Latest verified standalone-quarter wells drilled \(Q2 2026\)\./);
  assert.match(cnx.definition, /total depth/i);

  const crk = card("CRK", "wells_drilled");
  assert.match(crk.definition, /^Latest verified standalone-quarter wells drilled \(Q2 2026\)\./);
  assert.match(crk.definition, /gross wells drilled/i);

  const exe = card("EXE", "wells_drilled");
  assert.match(exe.definition, /^Latest verified standalone-quarter wells drilled \(Q1 2026\)\./);
  assert.match(exe.definition, /Codex workbook "Wells Drilled" row/);

  const gpor = card("GPOR", "wells_drilled");
  assert.match(gpor.definition, /^Latest verified standalone-quarter wells drilled \(Q1 2026\)\./);
  assert.match(gpor.definition, /Codex workbook "Wells Drilled" row/);

  const rrc = card("RRC", "wells_drilled");
  assert.equal(rrc.definition, "Latest verified standalone-quarter wells drilled. Company disclosure definitions may vary; unavailable where drilled wells are not explicitly reported.");
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

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { formatSignedPct } = load("lib/reports/render/format.ts");
const { moneyDisplay } = load("lib/reports/adapters/format.ts");
const { describeFinancialSource, describeMarketDataSource } = load("lib/reports/adapters/source-labels.ts");

test("formatSignedPct uses a leading ASCII sign, never a Unicode arrow (a real Preview PDF showed arrows render as a blank gap)", () => {
  assert.equal(formatSignedPct(3.6, "up"), "+3.6%");
  assert.equal(formatSignedPct(72.66, "down"), "-72.7%");
  assert.doesNotMatch(formatSignedPct(1, "up"), /[↑↓→]/);
});

test("formatSignedPct always uses the absolute value's magnitude regardless of the raw deltaPct's own sign", () => {
  assert.equal(formatSignedPct(-72.7, "down"), "-72.7%");
  assert.equal(formatSignedPct(-72.7, "up"), "+72.7%");
});

test("formatSignedPct renders 'flat' as plain text, not a sign or arrow", () => {
  assert.equal(formatSignedPct(0, "flat"), "flat");
});

test("moneyDisplay puts the minus sign before the dollar sign for a negative value (real Preview PDF showed '$-211MM' instead of '-$211MM')", () => {
  assert.equal(moneyDisplay(-211), "-$211MM");
  assert.equal(moneyDisplay(111), "$111MM");
  assert.equal(moneyDisplay(null), "--");
});

test("describeFinancialSource never returns an internal tool-name tag verbatim -- every SourceTag maps to a human-readable provenance description", () => {
  for (const tag of ["codex", "factset", "sec-direct", "sec-xbrl"]) {
    const label = describeFinancialSource(tag);
    assert.notEqual(label, tag);
    assert.doesNotMatch(label, /^codex$/i);
  }
});

test("describeMarketDataSource labels are distinct from describeFinancialSource labels -- market data is never presented as filing-sourced financial-statement data", () => {
  const marketLabel = describeMarketDataSource("macrotrends");
  assert.match(marketLabel, /market data/i);
});

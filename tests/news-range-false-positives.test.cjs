const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { matchesRangeResources } = load("lib/news/relevance/entities.ts");

const NEGATIVE_EXAMPLES = [
  ["price range", "Analysts see the stock trading in a narrow price range through year-end."],
  ["trading range", "Crude oil has been stuck in a tight trading range for weeks."],
  ["mountain range", "The hikers crossed the entire mountain range before sunset."],
  ["shooting range", "The new shooting range opened downtown this weekend."],
  ["product range", "The company expanded its product range to include three new items."]
];

for (const [label, text] of NEGATIVE_EXAMPLES) {
  test(`"${label}" does not trigger a Range Resources match`, () => {
    assert.equal(matchesRangeResources(text), false, `unrelated use of "range" (${label}) must not match Range Resources`);
  });
}

test("a negative-phrase use of 'range' does not become a false positive even when the article also discusses natural gas", () => {
  const text = "Natural gas prices settled in a narrow trading range Tuesday, unrelated to any single producer.";
  assert.equal(matchesRangeResources(text), false);
});

const POSITIVE_EXAMPLES = [
  ["exact company name", "Range Resources Corporation reported record Marcellus production."],
  ["RRC ticker with context", "Shares of the company (NYSE: RRC) climbed after earnings."],
  ["bare 'Range' with strong oil & gas context", "Range's latest Marcellus wells outperformed initial guidance."]
];

for (const [label, text] of POSITIVE_EXAMPLES) {
  test(`"${label}" correctly matches Range Resources`, () => {
    assert.equal(matchesRangeResources(text), true, `expected a Range Resources match for: ${label}`);
  });
}

test("a bare 'range' with no oil & gas context at all does not match", () => {
  assert.equal(matchesRangeResources("The thermostat has a wide temperature range."), false);
});

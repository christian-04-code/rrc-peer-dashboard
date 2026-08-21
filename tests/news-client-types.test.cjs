const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { categoryLabel, driverLabel, timeHorizonLabel, NEWS_CATEGORY_FILTERS, IMPACT_FILTERS, IMPACT_STRENGTH_FILTERS } = load(
  "lib/news/client-types.ts"
);
const { IMPACT_DRIVERS } = load("lib/news/impact-framework.ts");
const { NEWS_CATEGORIES } = load("lib/news/types.ts");

test("categoryLabel has a human-readable label for every backend category, never raw snake_case", () => {
  for (const category of NEWS_CATEGORIES) {
    const label = categoryLabel(category);
    assert.notEqual(label, category, `expected a human label for "${category}", not the raw key`);
    assert.doesNotMatch(label, /_/, `label for "${category}" should not contain an underscore`);
  }
});

test("driverLabel reuses lib/news/impact-framework.ts as the single source of truth -- not a second independent list", () => {
  for (const key of Object.keys(IMPACT_DRIVERS)) {
    assert.equal(driverLabel(key), IMPACT_DRIVERS[key].label);
  }
});

test("driverLabel examples match the documented conversions", () => {
  assert.equal(driverLabel("gas_pricing"), "Natural Gas Pricing");
  assert.equal(driverLabel("lng_demand"), "LNG Feedgas / Export Demand");
  assert.equal(driverLabel("appalachian_takeaway"), "Appalachian Takeaway Capacity");
  assert.equal(driverLabel("power_data_center_demand"), "Power / Data Center Demand");
  assert.equal(driverLabel("regulation"), "Regulation / Permitting");
});

test("timeHorizonLabel converts every controlled enum value to readable text, never raw snake_case", () => {
  const cases = {
    near_term: "Near Term",
    medium_term: "Medium Term",
    long_term: "Long Term",
    multi_horizon: "Multi-Horizon"
  };
  for (const [value, expected] of Object.entries(cases)) {
    assert.equal(timeHorizonLabel(value), expected);
  }
});

test("NEWS_CATEGORY_FILTERS starts with 'All' and covers exactly the 9 backend categories plus 'all'", () => {
  assert.equal(NEWS_CATEGORY_FILTERS[0].value, "all");
  assert.equal(NEWS_CATEGORY_FILTERS[0].label, "All");
  assert.equal(NEWS_CATEGORY_FILTERS.length, NEWS_CATEGORIES.length + 1);
  for (const category of NEWS_CATEGORIES) {
    assert.ok(NEWS_CATEGORY_FILTERS.some((f) => f.value === category), `missing filter option for "${category}"`);
  }
});

test("IMPACT_FILTERS covers All Impacts, Positive, Negative, Neutral", () => {
  assert.deepEqual(
    IMPACT_FILTERS.map((f) => f.value),
    ["all", "positive", "negative", "neutral"]
  );
});

test("IMPACT_STRENGTH_FILTERS covers All Strengths, Low, Medium, High", () => {
  assert.deepEqual(
    IMPACT_STRENGTH_FILTERS.map((f) => f.value),
    ["all", "low", "medium", "high"]
  );
});

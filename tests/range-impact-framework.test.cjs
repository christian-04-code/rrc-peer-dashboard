const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { IMPACT_DRIVERS, IMPACT_FRAMEWORK_VERSION, getImpactDriver, isImpactDriverKey } = load("lib/range-impact-framework.ts");

// The 8 keys News shipped before Phase 6 -- must all still be present and
// unrenamed after the move from lib/news/impact-framework.ts.
const NEWS_DRIVERS = [
  "gas_pricing",
  "lng_demand",
  "appalachian_takeaway",
  "gas_rig_activity",
  "storage_levels",
  "power_data_center_demand",
  "ngl_demand",
  "regulation"
];

// Added in Phase 6 for the Macro EIA intelligence system.
const MACRO_DRIVERS = ["us_gas_supply", "appalachia_supply", "industrial_demand", "weather"];

test("every pre-Phase-6 News driver is still present and unrenamed", () => {
  for (const key of NEWS_DRIVERS) {
    assert.ok(key in IMPACT_DRIVERS, `expected driver "${key}" to be defined`);
  }
});

test("every Phase 6 Macro driver is present", () => {
  for (const key of MACRO_DRIVERS) {
    assert.ok(key in IMPACT_DRIVERS, `expected Macro driver "${key}" to be defined`);
  }
});

test("the framework carries exactly the News + Macro keys, nothing extra", () => {
  assert.deepEqual(Object.keys(IMPACT_DRIVERS).sort(), [...NEWS_DRIVERS, ...MACRO_DRIVERS].sort());
});

test("the framework version is a semantic version string", () => {
  assert.match(IMPACT_FRAMEWORK_VERSION, /^\d+\.\d+\.\d+$/);
});

test("the framework version was not bumped by the Phase 6 addition -- adding new keys doesn't change the meaning of any News-analyzed article's existing impactFrameworkVersion", () => {
  assert.equal(IMPACT_FRAMEWORK_VERSION, "1.0.0");
});

test("every driver definition (News and Macro) describes both a potential positive and potential negative effect, never a guaranteed outcome", () => {
  for (const driver of Object.values(IMPACT_DRIVERS)) {
    assert.ok(driver.potentialPositiveEffect.length > 0);
    assert.ok(driver.potentialNegativeEffect.length > 0);
    assert.match(driver.potentialPositiveEffect, /may/i, "driver language must be framed as a potential effect, not a guaranteed one");
    assert.match(driver.potentialNegativeEffect, /may/i);
  }
});

test("isImpactDriverKey correctly distinguishes real driver keys (News and Macro) from arbitrary strings", () => {
  assert.equal(isImpactDriverKey("gas_pricing"), true);
  assert.equal(isImpactDriverKey("us_gas_supply"), true);
  assert.equal(isImpactDriverKey("stock_buyback_signal"), false);
});

test("getImpactDriver returns the matching definition for both News and Macro keys", () => {
  assert.equal(getImpactDriver("storage_levels").label, "Natural Gas Storage Levels");
  assert.equal(getImpactDriver("appalachia_supply").label, "Appalachia Basin Supply");
});

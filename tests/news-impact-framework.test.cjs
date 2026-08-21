const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { IMPACT_DRIVERS, IMPACT_FRAMEWORK_VERSION, getImpactDriver, isImpactDriverKey } = load("lib/news/impact-framework.ts");

const EXPECTED_DRIVERS = [
  "gas_pricing",
  "lng_demand",
  "appalachian_takeaway",
  "gas_rig_activity",
  "storage_levels",
  "power_data_center_demand",
  "ngl_demand",
  "regulation"
];

test("every driver from the approved architecture is present", () => {
  for (const key of EXPECTED_DRIVERS) {
    assert.ok(key in IMPACT_DRIVERS, `expected driver "${key}" to be defined`);
  }
});

test("the framework version is a semantic version string", () => {
  assert.match(IMPACT_FRAMEWORK_VERSION, /^\d+\.\d+\.\d+$/);
});

test("every driver definition describes both a potential positive and potential negative effect, never a guaranteed outcome", () => {
  for (const driver of Object.values(IMPACT_DRIVERS)) {
    assert.ok(driver.potentialPositiveEffect.length > 0);
    assert.ok(driver.potentialNegativeEffect.length > 0);
    assert.match(driver.potentialPositiveEffect, /may/i, "driver language must be framed as a potential effect, not a guaranteed one");
    assert.match(driver.potentialNegativeEffect, /may/i);
  }
});

test("isImpactDriverKey correctly distinguishes real driver keys from arbitrary strings", () => {
  assert.equal(isImpactDriverKey("gas_pricing"), true);
  assert.equal(isImpactDriverKey("stock_buyback_signal"), false);
});

test("getImpactDriver returns the matching definition", () => {
  assert.equal(getImpactDriver("storage_levels").label, "Natural Gas Storage Levels");
});

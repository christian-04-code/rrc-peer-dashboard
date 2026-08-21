const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { getRelevantDriverKeys } = load("lib/news/ai/relevant-drivers.ts");
const { IMPACT_DRIVERS } = load("lib/news/impact-framework.ts");

const ALL_DRIVER_COUNT = Object.keys(IMPACT_DRIVERS).length;

test("a 'range' category gets the full driver framework, since company-specific news can implicate any driver", () => {
  const keys = getRelevantDriverKeys(["range"]);
  assert.equal(keys.length, ALL_DRIVER_COUNT);
});

test("a 'peers' category also gets the full driver framework", () => {
  const keys = getRelevantDriverKeys(["peers"]);
  assert.equal(keys.length, ALL_DRIVER_COUNT);
});

test("'natural_gas' maps to a small, relevant subset -- not the full framework", () => {
  const keys = getRelevantDriverKeys(["natural_gas"]);
  assert.ok(keys.length < ALL_DRIVER_COUNT);
  assert.ok(keys.includes("gas_pricing"));
  assert.ok(keys.includes("storage_levels"));
});

test("'lng' maps to LNG demand and gas pricing", () => {
  const keys = getRelevantDriverKeys(["lng"]);
  assert.ok(keys.includes("lng_demand"));
});

test("'appalachia' maps to Appalachian takeaway", () => {
  const keys = getRelevantDriverKeys(["appalachia"]);
  assert.ok(keys.includes("appalachian_takeaway"));
});

test("'ngl' maps to NGL demand", () => {
  const keys = getRelevantDriverKeys(["ngl"]);
  assert.deepEqual(keys, ["ngl_demand"]);
});

test("'regulatory' maps to the regulation driver", () => {
  const keys = getRelevantDriverKeys(["regulatory"]);
  assert.deepEqual(keys, ["regulation"]);
});

test("multiple categories union their driver sets without duplicates", () => {
  const keys = getRelevantDriverKeys(["natural_gas", "lng"]);
  assert.ok(keys.includes("gas_pricing"));
  assert.ok(keys.includes("lng_demand"));
  assert.equal(new Set(keys).size, keys.length, "no duplicate driver keys");
});

test("an empty or unrecognized category list falls back to the full framework rather than an empty set", () => {
  const keys = getRelevantDriverKeys([]);
  assert.equal(keys.length, ALL_DRIVER_COUNT);
});

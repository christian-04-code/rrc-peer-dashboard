const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { getRelevantDriverKeys, NEWS_DRIVER_KEYS } = load("lib/news/ai/relevant-drivers.ts");
const { IMPACT_DRIVERS } = load("lib/range-impact-framework.ts");

// News's full driver count is its own fixed subset (NEWS_DRIVER_KEYS), never
// the shared framework's total key count -- lib/range-impact-framework.ts
// (Phase 6) also carries Macro-only keys that News must never see or send.
const ALL_DRIVER_COUNT = NEWS_DRIVER_KEYS.length;

test("News's driver subset is exactly the original 8 keys -- Phase 6's Macro-only additions to the shared framework must never expand it", () => {
  assert.deepEqual(
    NEWS_DRIVER_KEYS.slice().sort(),
    ["appalachian_takeaway", "gas_pricing", "gas_rig_activity", "lng_demand", "ngl_demand", "power_data_center_demand", "regulation", "storage_levels"]
  );
  assert.ok(Object.keys(IMPACT_DRIVERS).length > NEWS_DRIVER_KEYS.length, "sanity check: the shared framework must carry more keys than News uses, proving this test would catch scope creep");
});

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

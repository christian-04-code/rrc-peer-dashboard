const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { evaluateReadiness, REQUIRED_WEEKLY_REPORT_INPUTS, OPTIONAL_WEEKLY_REPORT_INPUTS } = load("lib/reports/readiness.ts");

function allRequiredTrue(overrides = {}) {
  const inputs = {};
  for (const key of REQUIRED_WEEKLY_REPORT_INPUTS) inputs[key] = true;
  return { ...inputs, ...overrides };
}

test("ready is true when every required input is true and no optional input is supplied", () => {
  const result = evaluateReadiness(allRequiredTrue());
  assert.equal(result.ready, true);
  assert.deepEqual(result.missingRequired, []);
  assert.deepEqual(result.degradedOptional, [...OPTIONAL_WEEKLY_REPORT_INPUTS]);
});

test("ready is false when any single required input is false", () => {
  const result = evaluateReadiness(allRequiredTrue({ eiaWeeklyStorageObservation: false }));
  assert.equal(result.ready, false);
  assert.deepEqual(result.missingRequired, ["eiaWeeklyStorageObservation"]);
});

test("ready is false and lists every missing required input, not just the first", () => {
  const result = evaluateReadiness(
    allRequiredTrue({ eiaWeeklyStorageObservation: false, sourceFreshnessManifest: false })
  );
  assert.equal(result.ready, false);
  assert.deepEqual(result.missingRequired.sort(), ["eiaWeeklyStorageObservation", "sourceFreshnessManifest"].sort());
});

test("optional inputs never affect readiness even when all are false", () => {
  const inputs = allRequiredTrue();
  for (const key of OPTIONAL_WEEKLY_REPORT_INPUTS) inputs[key] = false;
  const result = evaluateReadiness(inputs);
  assert.equal(result.ready, true);
  assert.deepEqual(result.degradedOptional.sort(), [...OPTIONAL_WEEKLY_REPORT_INPUTS].sort());
});

test("an optional input that is true is not reported as degraded", () => {
  const result = evaluateReadiness(allRequiredTrue({ peers: true, peerComparisons: true }));
  assert.ok(!result.degradedOptional.includes("peerComparisons"));
});

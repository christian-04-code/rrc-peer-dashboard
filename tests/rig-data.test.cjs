const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const rigData = load("lib/rigs/rig-data.ts");
const storageRegions = load("lib/market/storage-regions.ts");

const dataset = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/rigs/rig-count.json"), "utf8"));

test("dataset schema and source metadata are present", () => {
  assert.equal(dataset.schemaVersion, 1);
  assert.equal(dataset.source.provider, "Baker Hughes");
  assert.match(dataset.source.reportDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof dataset.source.workbookSha256, "string");
  assert.equal(dataset.source.workbookSha256.length, 64);
});

test("state totals reconcile to the published US total", () => {
  const stateSum = Object.values(dataset.states).reduce((sum, state) => sum + (state.current ?? 0), 0);
  assert.equal(stateSum, dataset.national.unitedStates.current);
});

test("basin totals reconcile to the published US total", () => {
  const basinSum = dataset.usBasins.reduce((sum, basin) => sum + (basin.current ?? 0), 0);
  assert.equal(basinSum, dataset.national.unitedStates.current);
});

test("every tracked state's gas + oil + misc commodity mix reconciles to its current total", () => {
  for (const [code, state] of Object.entries(dataset.states)) {
    const mixSum = state.commodityMix.gas + state.commodityMix.oil + state.commodityMix.misc;
    assert.ok(Math.abs(mixSum - (state.current ?? 0)) < 0.01, `${code}: commodity mix ${mixSum} != current ${state.current}`);
  }
});

test("every tracked state's top counties never exceed the state total", () => {
  for (const [code, state] of Object.entries(dataset.states)) {
    const countySum = state.topCounties.reduce((sum, county) => sum + county.rigs, 0);
    assert.ok(countySum <= (state.current ?? 0) + 0.01, `${code}: top counties sum ${countySum} exceeds current ${state.current}`);
  }
});

test("state codes are valid, resolvable US state codes", () => {
  for (const code of Object.keys(dataset.states)) {
    assert.equal(code, code.toUpperCase());
    assert.ok(storageRegions.getStateName(code), `${code} should resolve to a known state name`);
  }
});

test("history is present, chronologically descending, and capped at 52 weeks", () => {
  for (const [code, state] of Object.entries(dataset.states)) {
    assert.ok(state.history.length > 0 && state.history.length <= 52, `${code}: unexpected history length ${state.history.length}`);
    const periods = state.history.map((point) => point.period);
    assert.deepEqual(periods, [...periods].sort().reverse(), `${code}: history is not newest-first`);
    assert.equal(state.history[0].period, dataset.source.reportDate);
  }
});

test("PA reconciles to known reviewed values from the source workbook", () => {
  const pa = dataset.states.PA;
  assert.equal(pa.current, 16);
  assert.equal(pa.yoy, -2);
  assert.equal(pa.commodityMix.gas, 16);
  assert.equal(pa.commodityMix.oil, 0);
  assert.equal(pa.topCounties[0].dominantBasin, "Marcellus");
});

test("getRigState is case-insensitive and returns null for a state Baker Hughes does not individually track", () => {
  assert.equal(rigData.getRigState("pa").current, dataset.states.PA.current);
  assert.equal(rigData.getRigState("MA"), null);
  assert.equal(rigData.isRigStateTracked("PA"), true);
  assert.equal(rigData.isRigStateTracked("MA"), false);
});

test("getRigStateMax returns the largest tracked current rig count (TX)", () => {
  assert.equal(rigData.getRigStateMax(), dataset.states.TX.current);
});

test("map rendering data contract: every tracked state code maps onto a MacroEnergyMap-renderable US state", () => {
  const macroSource = fs.readFileSync(path.join(process.cwd(), "components/dashboard/MacroEnergyMap.tsx"), "utf8");
  assert.match(macroSource, /getRigState/);
  assert.match(macroSource, /rigOverlay/);
  for (const code of rigData.getTrackedRigStateCodes()) {
    assert.ok(storageRegions.getStateName(code), `${code} must resolve on the map's state code/name table`);
  }
});

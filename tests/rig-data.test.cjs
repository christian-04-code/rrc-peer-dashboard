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

test("every tracked state's horizontal + directional + vertical trajectory mix reconciles to its current total", () => {
  for (const [code, state] of Object.entries(dataset.states)) {
    const trajectorySum = state.trajectoryMix.horizontal + state.trajectoryMix.directional + state.trajectoryMix.vertical;
    assert.ok(Math.abs(trajectorySum - (state.current ?? 0)) < 0.01, `${code}: trajectory mix ${trajectorySum} != current ${state.current}`);
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
  // Regression: trajectoryMix was previously always {0,0,0} for every state (an
  // uppercase-vs-title-case label mismatch in scripts/rigs/import.py's aggregation
  // lookup), which silently hid the trajectory row in the Drilling Activity module.
  assert.equal(pa.trajectoryMix.horizontal, 14);
  assert.equal(pa.trajectoryMix.directional, 2);
  assert.equal(pa.trajectoryMix.vertical, 0);
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

// -- Basin rig activity (Part 3) ---------------------------------------------

test("basin summary (usBasins) and basin detail (basins) cover the same set of basins", () => {
  const summaryNames = dataset.usBasins.map((basin) => basin.basin).sort();
  const detailNames = Object.keys(dataset.basins).sort();
  assert.deepEqual(summaryNames, detailNames);
});

test("every basin's gas + oil + misc commodity mix reconciles to its current total", () => {
  for (const [name, basin] of Object.entries(dataset.basins)) {
    const mixSum = basin.commodityMix.gas + basin.commodityMix.oil + basin.commodityMix.misc;
    assert.ok(Math.abs(mixSum - (basin.current ?? 0)) < 0.01, `${name}: commodity mix ${mixSum} != current ${basin.current}`);
  }
});

test("every basin's horizontal + directional + vertical trajectory mix reconciles to its current total", () => {
  for (const [name, basin] of Object.entries(dataset.basins)) {
    const trajectorySum = basin.trajectoryMix.horizontal + basin.trajectoryMix.directional + basin.trajectoryMix.vertical;
    assert.ok(Math.abs(trajectorySum - (basin.current ?? 0)) < 0.01, `${name}: trajectory mix ${trajectorySum} != current ${basin.current}`);
  }
});

test("every basin's state membership sums to its current total", () => {
  for (const [name, basin] of Object.entries(dataset.basins)) {
    const stateSum = basin.states.reduce((sum, state) => sum + state.current, 0);
    assert.ok(Math.abs(stateSum - (basin.current ?? 0)) < 0.01, `${name}: state membership sum ${stateSum} != current ${basin.current}`);
  }
});

test("every basin's top locations never exceed its current total, and are sorted descending", () => {
  for (const [name, basin] of Object.entries(dataset.basins)) {
    const locationSum = basin.topLocations.reduce((sum, location) => sum + location.rigs, 0);
    assert.ok(locationSum <= (basin.current ?? 0) + 0.01, `${name}: top locations sum ${locationSum} exceeds current ${basin.current}`);
    const rigCounts = basin.topLocations.map((location) => location.rigs);
    assert.deepEqual(rigCounts, [...rigCounts].sort((a, b) => b - a), `${name}: top locations are not sorted descending`);
  }
});

test("basin history is present, chronologically descending, and capped at 52 weeks", () => {
  for (const [name, basin] of Object.entries(dataset.basins)) {
    assert.ok(basin.history.length > 0 && basin.history.length <= 52, `${name}: unexpected history length ${basin.history.length}`);
    const periods = basin.history.map((point) => point.period);
    assert.deepEqual(periods, [...periods].sort().reverse(), `${name}: history is not newest-first`);
    assert.equal(basin.history[0].period, dataset.source.reportDate);
  }
});

test("zero-rig basins (e.g. Mississippian) are present with an explicit zero, not missing from the dataset", () => {
  assert.ok("Mississippian" in dataset.basins);
  assert.equal(dataset.basins.Mississippian.current, 0);
  assert.deepEqual(dataset.basins.Mississippian.states, []);
});

test("Permian, Marcellus, and Eagle Ford reconcile to known reviewed values from the source workbook", () => {
  const permian = dataset.basins.Permian;
  assert.equal(permian.current, 265);
  assert.deepEqual(permian.states.map((state) => state.code), ["TX", "NM"]);
  assert.equal(permian.commodityMix.oil, 263);
  assert.equal(permian.commodityMix.gas, 2);

  const marcellus = dataset.basins.Marcellus;
  assert.equal(marcellus.current, 24);
  assert.deepEqual(marcellus.states.map((state) => state.code).sort(), ["PA", "WV"]);
  assert.equal(marcellus.commodityMix.gas, 24);

  const eagleFord = dataset.basins["Eagle Ford"];
  assert.equal(eagleFord.current, 49);
  assert.deepEqual(eagleFord.states.map((state) => state.code), ["TX"]);
});

test("getRankedRigBasins excludes zero-rig basins and sorts descending by current rig count", () => {
  const ranked = rigData.getRankedRigBasins();
  assert.ok(ranked.every((basin) => (basin.current ?? 0) > 0));
  const currents = ranked.map((basin) => basin.current);
  assert.deepEqual(currents, [...currents].sort((a, b) => b - a));
  assert.equal(ranked[0].basin, "Permian");
});

test("getTopRigBasins(8) returns exactly the 8 largest basins", () => {
  const top8 = rigData.getTopRigBasins(8);
  assert.equal(top8.length, 8);
  const ranked = rigData.getRankedRigBasins();
  assert.deepEqual(top8.map((basin) => basin.basin), ranked.slice(0, 8).map((basin) => basin.basin));
});

test("getRigBasin is exact-match and returns null for an unknown basin name", () => {
  assert.equal(rigData.getRigBasin("Permian").current, dataset.basins.Permian.current);
  assert.equal(rigData.getRigBasin("Not A Real Basin"), null);
});

test("basin rendering data contract: BasinRigActivity reads from the ranked-basin accessor, not a hard-coded list", () => {
  const basinSource = fs.readFileSync(path.join(process.cwd(), "components/dashboard/BasinRigActivity.tsx"), "utf8");
  assert.match(basinSource, /getRankedRigBasins/);
  assert.doesNotMatch(basinSource, /"Permian"|"Eagle Ford"|"Haynesville"|"Marcellus"/, "basin names must come from the dataset, not be hard-coded in the component");
  const macroSource = fs.readFileSync(path.join(process.cwd(), "components/dashboard/MacroEnergyMap.tsx"), "utf8");
  assert.match(macroSource, /BasinRigActivity/);
});

// -- Full basin reconciliation (every basin, not a 3-example sample) --------

test("every basin fully reconciles: current == gas+oil+misc == horizontal+directional+vertical == sum(states) simultaneously", () => {
  for (const [name, basin] of Object.entries(dataset.basins)) {
    const current = basin.current ?? 0;
    const mixSum = basin.commodityMix.gas + basin.commodityMix.oil + basin.commodityMix.misc;
    const trajSum = basin.trajectoryMix.horizontal + basin.trajectoryMix.directional + basin.trajectoryMix.vertical;
    const stateSum = basin.states.reduce((sum, state) => sum + state.current, 0);
    assert.ok(Math.abs(mixSum - current) < 0.01, `${name}: commodity mix ${mixSum} != current ${current}`);
    assert.ok(Math.abs(trajSum - current) < 0.01, `${name}: trajectory mix ${trajSum} != current ${current}`);
    assert.ok(Math.abs(stateSum - current) < 0.01, `${name}: state membership ${stateSum} != current ${current}`);
  }
});

test("the sum of every basin's current rig count equals the published US national total", () => {
  const total = Object.values(dataset.basins).reduce((sum, basin) => sum + (basin.current ?? 0), 0);
  assert.equal(total, dataset.national.unitedStates.current);
});

test("no basin history contains a duplicate published week", () => {
  for (const [name, basin] of Object.entries(dataset.basins)) {
    const periods = basin.history.map((point) => point.period);
    assert.equal(new Set(periods).size, periods.length, `${name}: duplicate week in history`);
  }
});

// -- BasinRigActivity behavior contracts (QA pass fixes) ---------------------

test("commodity filter contract: selecting Gas/Oil actually re-ranks the default sort column, not just relabels it", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components/dashboard/BasinRigActivity.tsx"), "utf8");
  // sortValue's "current" branch must read commodityMix.gas/oil when that view is
  // active -- a purely decorative filter would only touch display text, never sortValue.
  const sortValueFn = source.slice(source.indexOf("function sortValue"), source.indexOf("function toneClass"));
  assert.match(sortValueFn, /commodityView === "gas"/);
  assert.match(sortValueFn, /commodityView === "oil"/);
  assert.match(sortValueFn, /commodityMix\.gas/);
  assert.match(sortValueFn, /commodityMix\.oil/);
});

test("sorting contract: ties break deterministically on basin name, and null values are pushed out rather than sorted as zero", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components/dashboard/BasinRigActivity.tsx"), "utf8");
  const sortedBasinsFn = source.slice(source.indexOf("const sortedBasins"), source.indexOf("const visibleBasins"));
  assert.match(sortedBasinsFn, /localeCompare/);
  assert.match(sortedBasinsFn, /leftValue === null/);
  assert.match(sortedBasinsFn, /rightValue === null/);
});

test("selection contract: a basin selected via the dropdown that falls outside the visible top 8 is surfaced, not silently hidden", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components/dashboard/BasinRigActivity.tsx"), "utf8");
  assert.match(source, /selectedIsHidden/);
  assert.match(source, /outside the top/);
});

test("accessibility contract: commodity view exposes aria-pressed, and WoW/YoY commodity caveat is rendered as visible text, not only a title attribute", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components/dashboard/BasinRigActivity.tsx"), "utf8");
  assert.match(source, /aria-pressed=\{commodityView/);
  assert.match(source, /<small className="basin-caveat">WoW and YoY reflect total rig count change/);
});

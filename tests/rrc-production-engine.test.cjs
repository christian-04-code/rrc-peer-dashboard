const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

// Same transpile-at-test-time approach as tests/rrc-forecast-primitives.test.cjs.
function load(relativePath) {
  const filename = path.resolve(process.cwd(), relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: filename
  }).outputText;

  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(output, filename);
  return loaded.exports;
}

const engine = load("lib/forecast/production-engine.ts");
const calculations = load("lib/forecast/calculations.ts");

function sv(value, unit = "MMcf/d", period = "2026Q1", classification = "modeled") {
  return { value, unit, source: { name: "test", period, retrievedAt: "2026-08-04", classification } };
}

function beginning(overrides = {}) {
  return {
    period: "2026Q1",
    gasMmcfPerDay: sv(1000, "MMcf/d", "2026Q1", "reported"),
    nglMbblPerDay: sv(50, "Mbbl/d", "2026Q1", "reported"),
    oilMbblPerDay: sv(10, "Mbbl/d", "2026Q1", "reported"),
    ...overrides
  };
}

const BEGIN_TOTAL = 1000 + (50 + 10) * 6; // 1360 MMcfe/d
const MIX = {
  gasPctOfMcfe: 1000 / BEGIN_TOTAL,
  nglPctOfMcfe: 300 / BEGIN_TOTAL,
  oilPctOfMcfe: 60 / BEGIN_TOTAL
};

function mixFor(period) {
  return {
    period,
    gasPctOfMcfe: sv(MIX.gasPctOfMcfe, "decimal", period),
    nglPctOfMcfe: sv(MIX.nglPctOfMcfe, "decimal", period),
    oilPctOfMcfe: sv(MIX.oilPctOfMcfe, "decimal", period)
  };
}

function activityFor(period, tilCount, productivity, timing = "quarter-start") {
  return {
    period,
    tilCount: sv(tilCount, "count", period),
    productivityPerTilMcfePerDay: productivity === null ? sv(null, "MMcfe/d", period) : sv(productivity, "MMcfe/d", period),
    timing
  };
}

function baseAssumptions(overrides = {}) {
  return {
    beginning: beginning(),
    decline: { annualEffectiveDeclineRate: sv(0.2, "decimal", "2026") },
    activity: [],
    mix: [],
    ...overrides
  };
}

const days = { "2026Q1": 90, "2026Q2": 91, "2026Q3": 92, "2026Q4": 92 };
function periodsThrough(labels) {
  return labels.map((period) => ({ period, days: days[period] }));
}

// 1. Beginning production preservation
test("beginning production is preserved exactly with source metadata", () => {
  const result = engine.buildQuarterlyProduction(periodsThrough(["2026Q1"]), baseAssumptions());
  const q1 = result[0];
  assert.equal(q1.averageRatePerDay.gasMmcfPerDay, 1000);
  assert.equal(q1.averageRatePerDay.nglMbblPerDay, 50);
  assert.equal(q1.averageRatePerDay.oilMbblPerDay, 10);
  assert.equal(q1.averageRatePerDay.totalMcfePerDay, BEGIN_TOTAL);
  assert.deepEqual(q1.exitRatePerDay, q1.averageRatePerDay);
  assert.equal(q1.warnings.length, 0);
  assert.equal(q1.sources.length, 3);
  assert.equal(q1.volumes.gasMmcf, 1000 * 90);
});

// 2. Base decline (no new wells)
test("base decline rolls forward from the prior exit rate using the explicit decline assumption", () => {
  const assumptions = baseAssumptions({
    activity: [activityFor("2026Q2", 0, null)],
    mix: [mixFor("2026Q1"), mixFor("2026Q2")]
  });
  const result = engine.buildQuarterlyProduction(periodsThrough(["2026Q1", "2026Q2"]), assumptions);
  const quarterlyRate = 1 - Math.pow(0.8, 0.25);
  const expectedExit = BEGIN_TOTAL * (1 - quarterlyRate);
  const q2 = result[1];
  assert.ok(Math.abs(q2.baseDeclineAppliedRate - quarterlyRate) < 1e-12);
  assert.ok(Math.abs(q2.exitRatePerDay.totalMcfePerDay - expectedExit) < 1e-9);
  assert.equal(q2.newWellContributionMcfePerDay, 0);
  const expectedAvg = (BEGIN_TOTAL + expectedExit) / 2;
  assert.ok(Math.abs(q2.averageRatePerDay.totalMcfePerDay - expectedAvg) < 1e-9);
});

// 3. Zero TIL activity resolves deterministically, even with no productivity input
test("zero TIL activity contributes exactly zero new production without requiring a productivity input", () => {
  const assumptions = baseAssumptions({
    activity: [activityFor("2026Q2", 0, null)],
    mix: [mixFor("2026Q1"), mixFor("2026Q2")]
  });
  const result = engine.buildQuarterlyProduction(periodsThrough(["2026Q1", "2026Q2"]), assumptions);
  const q2 = result[1];
  assert.equal(q2.newWellContributionMcfePerDay, 0);
  assert.ok(!q2.warnings.some((w) => w.includes("no supported productivity input")));
});

// 4. New production contribution
test("TIL activity with a supported productivity input adds new production on top of base decline", () => {
  const assumptions = baseAssumptions({
    activity: [activityFor("2026Q2", 4, 10, "quarter-start")],
    mix: [mixFor("2026Q1"), mixFor("2026Q2")]
  });
  const result = engine.buildQuarterlyProduction(periodsThrough(["2026Q1", "2026Q2"]), assumptions);
  const q2 = result[1];
  assert.equal(q2.newWellContributionMcfePerDay, 40);
  const quarterlyRate = 1 - Math.pow(0.8, 0.25);
  const baseEnd = BEGIN_TOTAL * (1 - quarterlyRate);
  assert.ok(Math.abs(q2.exitRatePerDay.totalMcfePerDay - (baseEnd + 40)) < 1e-9);
});

// 5. Quarterly timing changes the average but never the exit rate
test("timing convention changes the average contribution of new wells but not the exit rate", () => {
  function build(timing) {
    const assumptions = baseAssumptions({
      activity: [activityFor("2026Q2", 4, 10, timing)],
      mix: [mixFor("2026Q1"), mixFor("2026Q2")]
    });
    return engine.buildQuarterlyProduction(periodsThrough(["2026Q1", "2026Q2"]), assumptions)[1];
  }
  const start = build("quarter-start");
  const mid = build("mid-quarter");
  const end = build("quarter-end");

  assert.ok(Math.abs(start.exitRatePerDay.totalMcfePerDay - mid.exitRatePerDay.totalMcfePerDay) < 1e-9);
  assert.ok(Math.abs(mid.exitRatePerDay.totalMcfePerDay - end.exitRatePerDay.totalMcfePerDay) < 1e-9);

  const quarterlyRate = 1 - Math.pow(0.8, 0.25);
  const baseAvg = (BEGIN_TOTAL + BEGIN_TOTAL * (1 - quarterlyRate)) / 2;
  assert.ok(Math.abs(start.averageRatePerDay.totalMcfePerDay - (baseAvg + 40)) < 1e-9);
  assert.ok(Math.abs(mid.averageRatePerDay.totalMcfePerDay - (baseAvg + 20)) < 1e-9);
  assert.ok(Math.abs(end.averageRatePerDay.totalMcfePerDay - baseAvg) < 1e-9);
  assert.equal(start.timing, "quarter-start");
});

// 6. Commodity mix reconciliation
test("commodity mix splits reconcile to total production, and a non-reconciling mix is rejected rather than partially applied", () => {
  const assumptions = baseAssumptions({
    activity: [activityFor("2026Q2", 0, null)],
    mix: [mixFor("2026Q1"), mixFor("2026Q2")]
  });
  const [, q2] = engine.buildQuarterlyProduction(periodsThrough(["2026Q1", "2026Q2"]), assumptions);
  const reconciled = q2.averageRatePerDay.gasMmcfPerDay + (q2.averageRatePerDay.nglMbblPerDay + q2.averageRatePerDay.oilMbblPerDay) * 6;
  assert.ok(Math.abs(reconciled - q2.averageRatePerDay.totalMcfePerDay) < 1e-9);

  const badMix = {
    period: "2026Q2",
    gasPctOfMcfe: sv(0.5, "decimal", "2026Q2"),
    nglPctOfMcfe: sv(0.3, "decimal", "2026Q2"),
    oilPctOfMcfe: sv(0.3, "decimal", "2026Q2")
  };
  const badAssumptions = baseAssumptions({ activity: [activityFor("2026Q2", 0, null)], mix: [mixFor("2026Q1"), badMix] });
  const [, badQ2] = engine.buildQuarterlyProduction(periodsThrough(["2026Q1", "2026Q2"]), badAssumptions);
  assert.equal(badQ2.averageRatePerDay.gasMmcfPerDay, null);
  assert.ok(badQ2.averageRatePerDay.totalMcfePerDay !== null, "total production stays known even when the split is rejected");
  assert.ok(badQ2.warnings.some((w) => w.includes("does not reconcile")));
});

// 7. Annual-to-quarter consistency
test("annual production equals the exact sum of its quarterly components", () => {
  const labels = ["2026Q1", "2026Q2", "2026Q3", "2026Q4"];
  const assumptions = baseAssumptions({
    activity: [activityFor("2026Q2", 2, 5), activityFor("2026Q3", 0, null), activityFor("2026Q4", 1, 8, "mid-quarter")],
    mix: labels.map(mixFor)
  });
  const quarters = engine.buildQuarterlyProduction(periodsThrough(labels), assumptions);
  const annual = engine.summarizeAnnualProduction(quarters);
  assert.equal(annual.warnings.length, 0);
  const manualGas = quarters.reduce((sum, q) => sum + q.volumes.gasMmcf, 0);
  assert.ok(Math.abs(annual.gasMmcf - manualGas) < 1e-9);
  const reconciled = annual.gasMmcf + (annual.nglMbbl + annual.oilMbbl) * 6;
  assert.ok(Math.abs(reconciled - annual.totalMcfe) < 1e-6);
});

// 8. Baseline scenario determinism
test("identical inputs produce identical output on repeated runs", () => {
  const labels = ["2026Q1", "2026Q2", "2026Q3"];
  const assumptions = Object.freeze(
    baseAssumptions({
      activity: [activityFor("2026Q2", 2, 5), activityFor("2026Q3", 1, 6)],
      mix: labels.map(mixFor)
    })
  );
  const a = engine.buildQuarterlyProduction(periodsThrough(labels), assumptions);
  const b = engine.buildQuarterlyProduction(periodsThrough(labels), assumptions);
  assert.deepEqual(a, b);
});

// 9. Scenario isolation
test("scenario adjustment returns a new object and never mutates the shared baseline", () => {
  const labels = ["2026Q1", "2026Q2"];
  const baseline = baseAssumptions({ activity: [activityFor("2026Q2", 2, 5)], mix: labels.map(mixFor) });
  const before = JSON.parse(JSON.stringify(baseline));

  const high = engine.applyProductionScenarioAdjustment(baseline, { declineRateAbsoluteDelta: -0.1, productivityMultiplier: 1.5 });
  const low = engine.applyProductionScenarioAdjustment(baseline, { declineRateAbsoluteDelta: 0.1, productivityMultiplier: 0.5 });

  assert.deepEqual(baseline, before, "the baseline object must be untouched after deriving scenarios from it");
  assert.notEqual(high, baseline);
  assert.notEqual(low, baseline);

  const baseResult = engine.buildQuarterlyProduction(periodsThrough(labels), baseline);
  const highResult = engine.buildQuarterlyProduction(periodsThrough(labels), high);
  const lowResult = engine.buildQuarterlyProduction(periodsThrough(labels), low);

  assert.ok(highResult[1].exitRatePerDay.totalMcfePerDay > baseResult[1].exitRatePerDay.totalMcfePerDay);
  assert.ok(lowResult[1].exitRatePerDay.totalMcfePerDay < baseResult[1].exitRatePerDay.totalMcfePerDay);
});

// 10. Null input handling
test("a null beginning input flows through as null with a warning instead of becoming zero", () => {
  const assumptions = baseAssumptions({ beginning: beginning({ gasMmcfPerDay: sv(null, "MMcf/d", "2026Q1", "reported") }) });
  const [q1] = engine.buildQuarterlyProduction(periodsThrough(["2026Q1"]), assumptions);
  assert.equal(q1.averageRatePerDay.gasMmcfPerDay, null);
  assert.equal(q1.averageRatePerDay.totalMcfePerDay, null, "total must not silently drop the missing gas volume");
  assert.ok(q1.warnings.some((w) => w.includes("Beginning gas production")));
});

test("mismatched first period throws instead of silently rebasing", () => {
  assert.throws(() => engine.buildQuarterlyProduction(periodsThrough(["2026Q2"]), baseAssumptions()));
  assert.throws(() => engine.buildQuarterlyProduction([], baseAssumptions()));
});

// 11. Negative production rejection
test("negative production inputs are rejected rather than clamped or flipped", () => {
  const assumptions = baseAssumptions({ beginning: beginning({ oilMbblPerDay: sv(-5, "Mbbl/d", "2026Q1", "reported") }) });
  const [q1] = engine.buildQuarterlyProduction(periodsThrough(["2026Q1"]), assumptions);
  assert.equal(q1.averageRatePerDay.oilMbblPerDay, null);
  assert.ok(q1.warnings.some((w) => w.includes("negative")));
});

// 12. Invalid decline-rate rejection
test("a decline rate outside the supported range is rejected rather than silently defaulted", () => {
  const tooHigh = baseAssumptions({
    decline: { annualEffectiveDeclineRate: sv(1.5, "decimal", "2026") },
    activity: [activityFor("2026Q2", 0, null)],
    mix: [mixFor("2026Q1"), mixFor("2026Q2")]
  });
  const [, q2High] = engine.buildQuarterlyProduction(periodsThrough(["2026Q1", "2026Q2"]), tooHigh);
  assert.equal(q2High.baseDeclineAppliedRate, null);
  assert.equal(q2High.exitRatePerDay.totalMcfePerDay, null);
  assert.ok(q2High.warnings.some((w) => w.includes("outside the supported")));

  const negative = baseAssumptions({
    decline: { annualEffectiveDeclineRate: sv(-0.05, "decimal", "2026") },
    activity: [activityFor("2026Q2", 0, null)],
    mix: [mixFor("2026Q1"), mixFor("2026Q2")]
  });
  const [, q2Neg] = engine.buildQuarterlyProduction(periodsThrough(["2026Q1", "2026Q2"]), negative);
  assert.equal(q2Neg.baseDeclineAppliedRate, null, "a negative decline rate must not silently default to 0% decline");
});

// 13. NaN and Infinity rejection
test("NaN and Infinity inputs are rejected as unavailable rather than propagated", () => {
  const nanCase = baseAssumptions({ beginning: beginning({ gasMmcfPerDay: sv(NaN, "MMcf/d", "2026Q1", "reported") }) });
  const [q1Nan] = engine.buildQuarterlyProduction(periodsThrough(["2026Q1"]), nanCase);
  assert.equal(q1Nan.averageRatePerDay.gasMmcfPerDay, null);

  const infinityCase = baseAssumptions({
    activity: [activityFor("2026Q2", 2, Infinity)],
    mix: [mixFor("2026Q1"), mixFor("2026Q2")]
  });
  const [, q2Inf] = engine.buildQuarterlyProduction(periodsThrough(["2026Q1", "2026Q2"]), infinityCase);
  assert.equal(q2Inf.newWellContributionMcfePerDay, null);
  assert.ok(q2Inf.warnings.some((w) => w.includes("New-well productivity")));
});

// Pipeline integration: engine output composes with the existing calculateProduction contract
test("toProductionAssumptions output composes with the existing calculateProduction pipeline", () => {
  const assumptions = baseAssumptions({
    activity: [activityFor("2026Q2", 2, 5)],
    mix: [mixFor("2026Q1"), mixFor("2026Q2")]
  });
  const [, q2] = engine.buildQuarterlyProduction(periodsThrough(["2026Q1", "2026Q2"]), assumptions);
  const productionAssumptions = engine.toProductionAssumptions(q2, "test fixture");
  const warnings = [];
  const result = calculations.calculateProduction({ period: "2026Q2", days: 91, production: productionAssumptions }, warnings);
  assert.equal(warnings.length, 0);
  assert.ok(Math.abs(result.gasMmcf - q2.volumes.gasMmcf) < 1e-9);
  assert.ok(Math.abs(result.totalMcfe - q2.volumes.totalMcfe) < 1e-6);
});

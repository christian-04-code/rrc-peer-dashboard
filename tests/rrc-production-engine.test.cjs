const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

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

function sv(value, unit = "MMcf/d", period = "2026Q1", classification = "reported") {
  return { value, unit, source: { name: "test", period, retrievedAt: "2026-08-04", classification } };
}

function latestReported(overrides = {}) {
  return {
    period: "2026Q1",
    gasMmcfPerDay: sv(1000, "MMcf/d", "2026Q1", "reported"),
    nglMbblPerDay: sv(50, "Mbbl/d", "2026Q1", "reported"),
    oilMbblPerDay: sv(10, "Mbbl/d", "2026Q1", "reported"),
    ...overrides
  };
}

const TOTAL = 1000 + (50 + 10) * 6; // 1360 MMcfe/d
const days = { "2026Q1": 90, "2026Q2": 91, "2026Q3": 92, "2026Q4": 92 };
function periodsThrough(labels) {
  return labels.map((period) => ({ period, days: days[period] }));
}

// 1. Latest reported production copied across forecast periods
test("every forecast period defaults to the latest reported production, held flat", () => {
  const labels = ["2026Q1", "2026Q2", "2026Q3", "2026Q4"];
  const result = engine.buildFlatProductionForecast(latestReported(), periodsThrough(labels));
  for (const period of result) {
    assert.equal(period.ratePerDay.gasMmcfPerDay, 1000);
    assert.equal(period.ratePerDay.nglMbblPerDay, 50);
    assert.equal(period.ratePerDay.oilMbblPerDay, 10);
    assert.equal(period.sourceClassification, "reported");
    assert.equal(period.overriddenFields.length, 0);
  }
});

// 2. Separate gas/NGL/oil values preserved
test("gas, NGL, and oil are preserved as separate streams, not collapsed into a single total", () => {
  const [q1] = engine.buildFlatProductionForecast(latestReported(), periodsThrough(["2026Q1"]));
  assert.equal(q1.ratePerDay.totalMcfePerDay, TOTAL);
  assert.equal(q1.volumes.gasMmcf, 1000 * 90);
  assert.equal(q1.volumes.nglMbbl, 50 * 90);
  assert.equal(q1.volumes.oilMbbl, 10 * 90);
  const reconciled = q1.volumes.gasMmcf + (q1.volumes.nglMbbl + q1.volumes.oilMbbl) * 6;
  assert.equal(q1.volumes.totalMcfe, reconciled);
});

// 3. Manual override applied only to the selected period
test("a manual override changes only its own period, leaving every other period at the reported baseline", () => {
  const labels = ["2026Q1", "2026Q2", "2026Q3"];
  const overrides = [{ period: "2026Q2", gasMmcfPerDay: 1200 }];
  const result = engine.buildFlatProductionForecast(latestReported(), periodsThrough(labels), overrides);
  const [q1, q2, q3] = result;
  assert.equal(q1.ratePerDay.gasMmcfPerDay, 1000, "the reported period itself must never change");
  assert.equal(q2.ratePerDay.gasMmcfPerDay, 1200);
  assert.equal(q2.ratePerDay.nglMbblPerDay, 50, "an override to gas must not touch NGL for the same period");
  assert.equal(q2.sourceClassification, "override");
  assert.deepEqual(q2.overriddenFields, ["gas"]);
  assert.equal(q3.ratePerDay.gasMmcfPerDay, 1000, "periods without an override entry stay at the reported baseline");
  assert.equal(q3.sourceClassification, "reported");
});

test("overriding the reported period itself is rejected rather than rewriting history", () => {
  const overrides = [{ period: "2026Q1", gasMmcfPerDay: 5000 }];
  const [q1] = engine.buildFlatProductionForecast(latestReported(), periodsThrough(["2026Q1"]), overrides);
  assert.equal(q1.ratePerDay.gasMmcfPerDay, 1000);
  assert.equal(q1.sourceClassification, "reported");
  assert.ok(q1.warnings.some((w) => w.includes("ignored")));
});

// 4. Reset returns to reported baseline
test("an empty overrides array (reset) reproduces the flat reported baseline exactly", () => {
  const labels = ["2026Q1", "2026Q2"];
  const withOverride = engine.buildFlatProductionForecast(latestReported(), periodsThrough(labels), [{ period: "2026Q2", gasMmcfPerDay: 1200 }]);
  assert.notEqual(withOverride[1].ratePerDay.gasMmcfPerDay, 1000);
  const reset = engine.buildFlatProductionForecast(latestReported(), periodsThrough(labels), []);
  assert.equal(reset[1].ratePerDay.gasMmcfPerDay, 1000);
  assert.equal(reset[1].sourceClassification, "reported");
});

// 5. Baseline object is not mutated
test("building a forecast never mutates the latestReported or overrides input objects", () => {
  const baseline = Object.freeze(latestReported());
  const overrides = Object.freeze([Object.freeze({ period: "2026Q2", gasMmcfPerDay: 1200 })]);
  assert.doesNotThrow(() => engine.buildFlatProductionForecast(baseline, periodsThrough(["2026Q1", "2026Q2"]), overrides));
});

// 6. Negative override rejected
test("a negative override is rejected rather than clamped or flipped", () => {
  const [, q2] = engine.buildFlatProductionForecast(latestReported(), periodsThrough(["2026Q1", "2026Q2"]), [
    { period: "2026Q2", oilMbblPerDay: -5 }
  ]);
  assert.equal(q2.ratePerDay.oilMbblPerDay, null);
  assert.ok(q2.warnings.some((w) => w.includes("negative")));
});

// 7. NaN and Infinity rejected
test("NaN and Infinity overrides are rejected as unavailable rather than propagated", () => {
  const [, q2] = engine.buildFlatProductionForecast(latestReported(), periodsThrough(["2026Q1", "2026Q2"]), [
    { period: "2026Q2", gasMmcfPerDay: NaN, nglMbblPerDay: Infinity }
  ]);
  assert.equal(q2.ratePerDay.gasMmcfPerDay, null);
  assert.equal(q2.ratePerDay.nglMbblPerDay, null);
  assert.equal(q2.ratePerDay.totalMcfePerDay, null);
  assert.ok(q2.warnings.some((w) => w.includes("finite")));
});

test("a null-vs-zero override distinction is preserved: zero is a real value, null explicitly clears", () => {
  const [, zero] = engine.buildFlatProductionForecast(latestReported(), periodsThrough(["2026Q1", "2026Q2"]), [
    { period: "2026Q2", oilMbblPerDay: 0 }
  ]);
  assert.equal(zero.ratePerDay.oilMbblPerDay, 0);
  assert.equal(zero.warnings.some((w) => w.includes("cleared")), false);

  const [, cleared] = engine.buildFlatProductionForecast(latestReported(), periodsThrough(["2026Q1", "2026Q2"]), [
    { period: "2026Q2", oilMbblPerDay: null }
  ]);
  assert.equal(cleared.ratePerDay.oilMbblPerDay, null);
  assert.ok(cleared.warnings.some((w) => w.includes("cleared")));
});

// 10. Deterministic output
test("identical inputs produce identical output on repeated runs", () => {
  const labels = ["2026Q1", "2026Q2", "2026Q3"];
  const baseline = Object.freeze(latestReported());
  const overrides = Object.freeze([Object.freeze({ period: "2026Q2", gasMmcfPerDay: 1200 })]);
  const a = engine.buildFlatProductionForecast(baseline, periodsThrough(labels), overrides);
  const b = engine.buildFlatProductionForecast(baseline, periodsThrough(labels), overrides);
  assert.deepEqual(a, b);
});

// 11. Total Mcfe reconciles to commodity components (across a 4-period annual set too)
test("annual production equals the exact sum of its period components and reconciles to total Mcfe", () => {
  const labels = ["2026Q1", "2026Q2", "2026Q3", "2026Q4"];
  const result = engine.buildFlatProductionForecast(latestReported(), periodsThrough(labels), [{ period: "2026Q3", gasMmcfPerDay: 1100 }]);
  const annual = engine.summarizeAnnualProduction(result);
  assert.equal(annual.warnings.length, 0);
  const manualGas = result.reduce((sum, p) => sum + p.volumes.gasMmcf, 0);
  assert.ok(Math.abs(annual.gasMmcf - manualGas) < 1e-9);
  const reconciled = annual.gasMmcf + (annual.nglMbbl + annual.oilMbbl) * 6;
  assert.ok(Math.abs(reconciled - annual.totalMcfe) < 1e-6);
});

test("null input handling: an unavailable reported field flows through as null, not zero", () => {
  const baseline = latestReported({ gasMmcfPerDay: sv(null, "MMcf/d", "2026Q1", "reported") });
  const [q1] = engine.buildFlatProductionForecast(baseline, periodsThrough(["2026Q1"]));
  assert.equal(q1.ratePerDay.gasMmcfPerDay, null);
  assert.equal(q1.ratePerDay.totalMcfePerDay, null, "total must not silently drop the missing gas volume");
  assert.ok(q1.warnings.some((w) => w.includes("Latest reported gas production")));
});

test("buildFlatProductionForecast requires at least one period", () => {
  assert.throws(() => engine.buildFlatProductionForecast(latestReported(), []));
});

// Pipeline integration: engine output composes with the existing calculateProduction contract
test("toProductionAssumptions output composes with the existing calculateProduction pipeline", () => {
  const [, q2] = engine.buildFlatProductionForecast(latestReported(), periodsThrough(["2026Q1", "2026Q2"]), [
    { period: "2026Q2", gasMmcfPerDay: 1200 }
  ]);
  const productionAssumptions = engine.toProductionAssumptions(q2);
  const warnings = [];
  const result = calculations.calculateProduction({ period: "2026Q2", days: 91, production: productionAssumptions }, warnings);
  assert.equal(warnings.length, 0);
  assert.equal(result.gasMmcf, q2.volumes.gasMmcf);
  assert.equal(result.totalMcfe, q2.volumes.totalMcfe);
});

// 8/9. Current market price flows through revenue, and a missing price produces null revenue with a warning
test("a current market price flows through the existing revenue calculation", () => {
  const [q1] = engine.buildFlatProductionForecast(latestReported(), periodsThrough(["2026Q1"]));
  const pricing = calculations.calculatePricing(
    {
      commodity: { henryHubPerMmbtu: sv(3.2, "$/MMBtu", "2026Q1", "live"), wtiPerBbl: sv(70, "$/bbl", "2026Q1", "live"), nglRealizationPctOfWti: sv(0, "decimal") },
      pricing: {
        gasBasisPerMcf: sv(0, "$/Mcf"),
        gasTransportMarketingPerMcf: sv(0, "$/Mcf"),
        gasHedgeImpactPerMcf: sv(0, "$/Mcf"),
        nglMarketingUpliftPerBbl: sv(0, "$/bbl"),
        nglHedgeImpactPerBbl: sv(0, "$/bbl"),
        oilDifferentialPerBbl: sv(0, "$/bbl"),
        oilHedgeImpactPerBbl: sv(0, "$/bbl")
      }
    },
    []
  );
  const revenue = calculations.calculateRevenue(q1.volumes, pricing);
  assert.equal(revenue.gasMillion, (q1.volumes.gasMmcf * 3.2) / 1000);
  assert.equal(revenue.oilMillion, (q1.volumes.oilMbbl * 70) / 1000);
});

test("an unavailable market price produces null revenue for that commodity with a warning, never a fabricated price", () => {
  const [q1] = engine.buildFlatProductionForecast(latestReported(), periodsThrough(["2026Q1"]));
  const warnings = [];
  const pricing = calculations.calculatePricing(
    {
      commodity: { henryHubPerMmbtu: sv(null, "$/MMBtu", "2026Q1", "live"), wtiPerBbl: sv(70, "$/bbl", "2026Q1", "live"), nglRealizationPctOfWti: sv(0, "decimal") },
      pricing: {
        gasBasisPerMcf: sv(0, "$/Mcf"),
        gasTransportMarketingPerMcf: sv(0, "$/Mcf"),
        gasHedgeImpactPerMcf: sv(0, "$/Mcf"),
        nglMarketingUpliftPerBbl: sv(0, "$/bbl"),
        nglHedgeImpactPerBbl: sv(0, "$/bbl"),
        oilDifferentialPerBbl: sv(0, "$/bbl"),
        oilHedgeImpactPerBbl: sv(0, "$/bbl")
      }
    },
    warnings
  );
  assert.equal(pricing.realizedGasPerMcf, null);
  assert.ok(warnings.some((w) => w.includes("Henry Hub")));
  const revenue = calculations.calculateRevenue(q1.volumes, pricing);
  assert.equal(revenue.gasMillion, null, "no fabricated gas revenue when the market price is unavailable");
  assert.equal(revenue.totalMillion, null);
  assert.notEqual(revenue.oilMillion, null, "oil revenue stays calculable independently of the missing gas price");
});

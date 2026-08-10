const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

function loadAnalytics() {
  const filename = path.resolve(process.cwd(), "lib/market/macro-analytics.ts");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(output, filename);
  return loaded.exports;
}

const {
  buildMacroSnapshot,
  buildStorageComparison,
  calculateFreshness,
  formatMetricValue,
  periodChangePct
} = loadAnalytics();

function metric(id, frequency, history) {
  const latest = history[0];
  return {
    id,
    label: id,
    value: latest?.value ?? null,
    unit: "unit",
    period: latest?.period ?? null,
    seriesId: "TEST",
    frequency,
    history,
    fetchedAt: "2026-08-10T00:00:00.000Z",
    source: "U.S. EIA (TEST)",
    classification: "delayed",
    freshness: latest ? "current" : "unavailable",
    status: latest ? "ok" : "unavailable"
  };
}

const storageHistory = [
  { period: "2026-08-07", value: 950 },
  { period: "2026-07-31", value: 925 },
  { period: "2025-08-08", value: 1000 },
  { period: "2024-08-09", value: 1000 },
  { period: "2023-08-11", value: 1000 },
  { period: "2022-08-12", value: 1000 },
  { period: "2021-08-13", value: 1000 }
];

test("freshness uses the returned observation period with frequency-specific boundaries", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");
  assert.equal(calculateFreshness("2026-08-07", "daily", now), "current");
  assert.equal(calculateFreshness("2026-08-04", "daily", now), "stale");
  assert.equal(calculateFreshness("2026-08-01", "weekly", now), "current");
  assert.equal(calculateFreshness("2026-07-30", "weekly", now), "stale");
  assert.equal(calculateFreshness("2026-06", "monthly", now), "current");
  assert.equal(calculateFreshness("2026-05", "monthly", now), "stale");
  assert.equal(calculateFreshness(null, "weekly", now), "unavailable");
  assert.equal(calculateFreshness("malformed", "weekly", now), "unavailable");
});

test("storage comparison uses exactly five same-week historical observations", () => {
  const result = buildStorageComparison(storageHistory);
  assert.equal(result.fiveYearAverage, 1000);
  assert.equal(result.versusAverage, -50);
  assert.equal(result.versusAveragePct, -5);
  assert.equal(result.yearOverYear, -50);
  assert.equal(result.weeklyChange, 25);

  assert.equal(buildStorageComparison(storageHistory.slice(0, -1)).fiveYearAverage, null);
});

test("missing values render as -- while a legitimate zero remains zero", () => {
  assert.equal(formatMetricValue(undefined), "--");
  assert.equal(formatMetricValue(metric("henry_hub", "daily", [])), "--");
  assert.equal(formatMetricValue(metric("henry_hub", "daily", [{ period: "2026-08-07", value: 0 }])), "0");
});

test("period percentage change does not divide by zero or invent a result", () => {
  assert.equal(periodChangePct(metric("test", "weekly", [{ period: "2026-08-07", value: 10 }])), null);
  assert.equal(periodChangePct(metric("test", "weekly", [{ period: "2026-08-07", value: 10 }, { period: "2026-07-31", value: 0 }])), null);
});

test("macro classification thresholds are deterministic and include the current inputs", () => {
  const lng = Array.from({ length: 13 }, (_, index) => ({
    period: `2026-${String(13 - index).padStart(2, "0")}`,
    value: index === 0 ? 105 : index === 12 ? 100 : 102
  }));
  const propane = Array.from({ length: 5 }, (_, index) => ({ period: `2026-07-${String(31 - index * 7).padStart(2, "0")}`, value: index === 0 ? 95 : 100 }));
  const result = buildMacroSnapshot([
    metric("storage", "weekly", storageHistory),
    metric("lng_exports", "monthly", lng),
    metric("propane_stocks", "weekly", propane)
  ]);

  assert.equal(result.find((item) => item.label === "Storage").state, "Below Normal");
  assert.equal(result.find((item) => item.label === "LNG").state, "Expanding");
  assert.equal(result.find((item) => item.label === "Natural Gas").state, "Tightening");
  assert.equal(result.find((item) => item.label === "NGL").state, "Supportive");
  assert.match(result.find((item) => item.label === "Natural Gas").inputs, /-5\.0%.*\+5\.0%/);
});

test("unavailable metrics produce unavailable classifications rather than neutral-looking data", () => {
  const result = buildMacroSnapshot([]);
  assert.equal(result.find((item) => item.label === "Natural Gas").state, "Unavailable");
  assert.equal(result.find((item) => item.label === "Storage").state, "Unavailable");
  assert.equal(result.find((item) => item.label === "NGL").state, "Unavailable");
});

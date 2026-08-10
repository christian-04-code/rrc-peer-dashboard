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

const { buildCurrentMarketPrices } = load("lib/forecast/live-market-prices.ts");

test("a valid live Henry Hub and WTI metric produce classification 'live' SourcedValues", () => {
  const result = buildCurrentMarketPrices({
    henryHub: { value: 3.12, period: "2026-08-07", fetchedAt: "2026-08-10T00:00:00.000Z", source: "U.S. EIA (NG.RNGWHHD.D)" },
    wti: { value: 63.5, period: "2026-08-07", fetchedAt: "2026-08-10T00:00:00.000Z", source: "U.S. EIA (PET.RWTC.D)" }
  });

  assert.equal(result.henryHubPerMmbtu.value, 3.12);
  assert.equal(result.henryHubPerMmbtu.unit, "$/MMBtu");
  assert.equal(result.henryHubPerMmbtu.source.classification, "live");
  assert.equal(result.henryHubPerMmbtu.source.period, "2026-08-07");

  assert.equal(result.wtiPerBbl.value, 63.5);
  assert.equal(result.wtiPerBbl.unit, "$/bbl");
  assert.equal(result.wtiPerBbl.source.classification, "live");
});

test("a missing or null metric falls back to undefined so the modeled scenario default applies", () => {
  const result = buildCurrentMarketPrices({ henryHub: null, wti: undefined });
  assert.equal(result.henryHubPerMmbtu, undefined);
  assert.equal(result.wtiPerBbl, undefined);
});

test("a non-numeric or non-finite value falls back to undefined rather than propagating", () => {
  const result = buildCurrentMarketPrices({
    henryHub: { value: null, period: "2026-08-07", fetchedAt: "2026-08-10T00:00:00.000Z", source: "U.S. EIA" },
    wti: { value: Number.NaN, period: "2026-08-07", fetchedAt: "2026-08-10T00:00:00.000Z", source: "U.S. EIA" }
  });
  assert.equal(result.henryHubPerMmbtu, undefined);
  assert.equal(result.wtiPerBbl, undefined);
});

test("a live value of exactly zero is never silently substituted or dropped", () => {
  const result = buildCurrentMarketPrices({
    henryHub: { value: 0, period: "2026-08-07", fetchedAt: "2026-08-10T00:00:00.000Z", source: "U.S. EIA" },
    wti: undefined
  });
  // Zero is a legitimate finite number and must be treated as a real live value, not filtered out.
  assert.equal(result.henryHubPerMmbtu.value, 0);
  assert.equal(result.henryHubPerMmbtu.source.classification, "live");
});

test("one commodity can be live while the other falls back independently", () => {
  const result = buildCurrentMarketPrices({
    henryHub: { value: 3.4, period: "2026-08-07", fetchedAt: "2026-08-10T00:00:00.000Z", source: "U.S. EIA" },
    wti: null
  });
  assert.equal(result.henryHubPerMmbtu.source.classification, "live");
  assert.equal(result.wtiPerBbl, undefined);
});

test("a live SourcedValue's notes describe a flat current-market scenario, not a forward curve", () => {
  const result = buildCurrentMarketPrices({
    henryHub: { value: 3.4, period: "2026-08-07", fetchedAt: "2026-08-10T00:00:00.000Z", source: "U.S. EIA" },
    wti: { value: 63.5, period: "2026-08-07", fetchedAt: "2026-08-10T00:00:00.000Z", source: "U.S. EIA" }
  });
  for (const sourcedValue of [result.henryHubPerMmbtu, result.wtiPerBbl]) {
    assert.match(sourcedValue.source.notes, /flat/i);
    assert.match(sourcedValue.source.notes, /not a futures or forward curve/i);
  }
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const complete = read("lib/forecast/scenarios/rrc-complete.ts");
const hedgeSettlements = read("lib/forecast/data/rrc-hedge-settlements.ts");
const hedgedScenario = read("lib/forecast/scenarios/rrc-hedged.ts");

test("no annual interpolation remains in the default forecast path", () => {
  assert.doesNotMatch(complete, /annualTargetBcfePerDay/);
  assert.doesNotMatch(complete, /const progress = /);
  assert.doesNotMatch(complete, /scaleProductMix/);
  assert.match(complete, /buildFlatProductionForecast\(/);
  assert.match(complete, /latestReportedProduction/);
});

test("quarterly hedge settlement exposes hedged volume per commodity for over-hedge checks", () => {
  assert.match(hedgeSettlements, /hedgedVolumeByCommodity/);
  assert.match(hedgeSettlements, /naturalGas: hedgedVolume\("natural_gas"\)/);
});

test("hedged scenario warns when disclosed hedge volume exceeds forecast production", () => {
  assert.match(hedgedScenario, /gasHedgedVolume > gasVolumeMcf/);
  assert.match(hedgedScenario, /oilHedgedVolume > oilVolumeBbl/);
  assert.match(hedgedScenario, /exceeds forecast gas production/);
  assert.match(hedgedScenario, /exceeds forecast oil production/);
});

test("hedged scenario no longer silently drops settlement-level warnings", () => {
  assert.match(hedgedScenario, /settlements\.warnings/);
});

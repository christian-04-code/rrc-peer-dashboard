const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(process.cwd(), "components", "forecast", "RrcScenarioWorkbench.tsx"), "utf8");

test("preset defaults powering the Bear/Base/Bull tooltip match the documented valuation assumptions exactly", () => {
  assert.match(source, /bear:\s*{\s*targetEvToEbitdax:\s*4\.5,\s*discountRate:\s*0\.12,\s*terminalGrowthRate:\s*-0\.01\s*}/);
  assert.match(source, /base:\s*{\s*targetEvToEbitdax:\s*5\.5,\s*discountRate:\s*0\.1,\s*terminalGrowthRate:\s*0\s*}/);
  assert.match(source, /bull:\s*{\s*targetEvToEbitdax:\s*6\.5,\s*discountRate:\s*0\.09,\s*terminalGrowthRate:\s*0\.01\s*}/);
});

test("a preset info tooltip is wired next to the scenario preset control and derives text from the real preset values", () => {
  assert.match(source, /function PresetInfoTooltip/);
  assert.match(source, /Scenario preset[\s\S]*<PresetInfoTooltip \/>[\s\S]*<select value={preset}/);
  assert.match(source, /formatPresetAssumptions\(presetDefaults\.bear\)/);
  assert.match(source, /formatPresetAssumptions\(presetDefaults\.base\)/);
  assert.match(source, /formatPresetAssumptions\(presetDefaults\.bull\)/);
});

test("tooltip copy clarifies these are valuation-only presets, not commodity/operating scenarios", () => {
  assert.match(source, /Valuation scenario presets only/);
  assert.match(source, /not commodity prices, production, CapEx, or costs/);
});

test("the preset tooltip does not introduce new scenario assumptions or touch valuation formulas", () => {
  assert.doesNotMatch(source, /nglRealizationPctOfWti\s*[:=]\s*[0-9.]+;?\s*\/\/.*(preset|tooltip)/i);
  assert.match(source, /useState<Preset>\("base"\)/, "the default preset is unchanged");
});

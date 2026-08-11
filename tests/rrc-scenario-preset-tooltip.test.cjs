const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(process.cwd(), "components", "forecast", "RrcScenarioWorkbench.tsx"), "utf8");

// The simplified Forecast page dropped the old hover/click info-tooltip in favor of a
// simpler transparency mechanism: the exact multiple a preset applies is always visible
// and editable in the "Target EV / EBITDAX" field itself (no explanatory copy needed to
// see what a preset changes), and the valuation summary states the multiple actually used
// ("AT {multiple}x") next to its EBITDAX input. These tests assert that mechanism instead
// of the removed PresetInfoTooltip component.

test("Bear/Base/Bull EV/EBITDAX multiples match the documented, unchanged valuation assumptions", () => {
  assert.match(source, /PRESET_MULTIPLES\s*=\s*\{\s*bear:\s*4\.5,\s*base:\s*5\.5,\s*bull:\s*6\.5\s*\}/);
});

test("selecting a preset updates the visible, editable target multiple field (no hidden state)", () => {
  assert.match(source, /useEffect\(\(\) => setMultiple\(String\(PRESET_MULTIPLES\[preset\]\)\), \[preset\]\)/);
  assert.match(source, /targetEvToEbitdax:\s*parsedOrUndefined\(multiple\)\s*\?\?\s*PRESET_MULTIPLES\[preset\]/);
});

test("the preset selector only changes the target multiple -- it does not touch production, commodity, cost, or capex state", () => {
  const presetGroupStart = source.indexOf("Scenario preset");
  const presetGroupEnd = source.indexOf("</label>", presetGroupStart);
  const presetGroup = source.slice(presetGroupStart, presetGroupEnd);
  assert.doesNotMatch(presetGroup, /setProduction|setCosts|setCapex|setCommodityMode/);
});

test("the default preset is unchanged", () => {
  assert.match(source, /useState<Preset>\("base"\)/);
});

test("the resulting valuation summary states the exact multiple used against the exact forward-year EBITDAX, so the preset's effect stays visible in the output, not just the input", () => {
  assert.match(source, /at \{multiple\}x/);
  assert.match(source, /\{result\.valuation\.forwardYear\}E EBITDAX x multiple/);
});

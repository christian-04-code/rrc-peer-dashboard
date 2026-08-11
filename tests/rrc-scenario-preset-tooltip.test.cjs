const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(process.cwd(), "components", "forecast", "RrcScenarioWorkbench.tsx"), "utf8");

test("Bear/Base/Bull EV/EBITDAX multiples match the documented valuation assumptions", () => {
  assert.match(source, /PRESET_MULTIPLES\s*=\s*\{\s*bear:\s*4\.5,\s*base:\s*5\.5,\s*bull:\s*6\.5\s*\}/);
});

test("selecting a preset updates the visible editable target multiple field", () => {
  assert.match(source, /useEffect\(\(\) => setMultiple\(String\(PRESET_MULTIPLES\[preset\]\)\), \[preset\]\)/);
  assert.match(source, /targetEvToEbitdax:\s*parsedOrUndefined\(multiple\)\s*\?\?\s*PRESET_MULTIPLES\[preset\]/);
});

test("the preset selector does not mutate operating assumptions", () => {
  const start = source.indexOf("Scenario preset");
  const end = source.indexOf("</label>", start);
  const block = source.slice(start, end);
  assert.doesNotMatch(block, /setProduction|setCosts|setCapex|setCommodityMode/);
});

test("default preset and resulting valuation multiple remain visible", () => {
  assert.match(source, /useState<Preset>\("base"\)/, "the default preset is unchanged");
  assert.match(source, /at \{multiple\}x/);
  assert.match(source, /\{result\.valuation\.forwardYear\}E EBITDAX x multiple/);
});

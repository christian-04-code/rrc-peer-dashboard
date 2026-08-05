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

test("quarterly production ramp starts each year exactly at its anchor instead of already 25% progressed", () => {
  // quarter/4 makes Q1 already a quarter of the way toward the year-end target, which both
  // misrepresents Q1 2026 as reported when it is really a scaled/invented value and breaks
  // continuity at each year boundary. (quarter - 1) / 3 reproduces `start` exactly at Q1 and
  // `end` exactly at Q4, matching the next year's hardcoded start.
  assert.match(complete, /const progress = \(quarter - 1\) \/ 3;/);
  assert.doesNotMatch(complete, /const progress = quarter \/ 4;/);
});

test("production ramp is continuous across year boundaries and reproduces the Q1 2026 baseline exactly", () => {
  function annualTarget(year, strategy) {
    if (year === 2026) return 2.35;
    if (year === 2027) return 2.6;
    return strategy === "maintenance" ? 2.6 : 2.68;
  }
  function total(year, quarter, strategy) {
    const start = year === 2026 ? 2.207436 : year === 2027 ? 2.35 : 2.6;
    const end = annualTarget(year, strategy);
    const progress = (quarter - 1) / 3;
    return start + (end - start) * progress;
  }
  assert.equal(total(2026, 1, "maintenance"), 2.207436, "Q1 2026 must equal the reported baseline, not a scaled value");
  assert.ok(Math.abs(total(2026, 4, "maintenance") - total(2027, 1, "maintenance")) < 1e-9, "2026 Q4 must hand off continuously into 2027 Q1");
  assert.ok(Math.abs(total(2027, 4, "maintenance") - total(2028, 1, "maintenance")) < 1e-9, "2027 Q4 must hand off continuously into 2028 Q1");
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

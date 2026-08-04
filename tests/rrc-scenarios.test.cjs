const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const scenarioPath = path.join(process.cwd(), "lib", "forecast", "scenarios", "rrc.ts");
const source = fs.readFileSync(scenarioPath, "utf8");

test("RRC scenario package includes both explicit post-2027 forks", () => {
  assert.match(source, /rrcBaseMaintenanceScenario/);
  assert.match(source, /rrcBaseGrowthScenario/);
  assert.match(source, /post2027Strategy: "maintenance"/);
  assert.match(source, /post2027Strategy: "continued-growth"/);
});

test("RRC scenario package covers each quarter from 2026 through 2028", () => {
  assert.match(source, /\[2026, 2027, 2028\]/);
  assert.match(source, /\[1, 2, 3, 4\]/);
});

test("RRC scenario package preserves benchmark versus realized-price separation", () => {
  assert.match(source, /3\.75/);
  assert.match(source, /benchmark scenario assumption, not Range realized pricing/);
  assert.match(source, /gasBasisPerMcf: unavailable/);
  assert.match(source, /gasTransportMarketingPerMcf: unavailable/);
});

test("unsupported product production and cost values remain unavailable", () => {
  assert.match(source, /gasMmcfPerDay: unavailable/);
  assert.match(source, /nglMbblPerDay: unavailable/);
  assert.match(source, /oilMbblPerDay: unavailable/);
  assert.match(source, /loePerMcfe: unavailable/);
  assert.match(source, /gatheringTransportPerMcfe: unavailable/);
});

test("source-backed management assumptions are present", () => {
  assert.match(source, /return 675/);
  assert.match(source, /strategy === "maintenance" \? 600 : 675/);
  assert.match(source, /value: period\.startsWith\("2026"\) \? 0\.02/);
  assert.match(source, /period\.startsWith\("2027"\) \? 0\.06/);
  assert.match(source, /24 \/ 65/);
});

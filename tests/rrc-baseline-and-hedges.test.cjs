const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const baseline = fs.readFileSync(
  path.join(process.cwd(), "lib", "forecast", "data", "rrc-baseline.ts"),
  "utf8"
);
const hedges = fs.readFileSync(
  path.join(process.cwd(), "lib", "forecast", "hedges.ts"),
  "utf8"
);

test("RRC baseline captures verified Q1 2026 reported facts", () => {
  assert.match(baseline, /totalProductionBcfePerDay: reported\(\s*2\.21/);
  assert.match(baseline, /liquidsPercentOfTotalMcfe: reported\(\s*0\.32/);
  assert.match(baseline, /gasDifferentialToNymexPerMcfIncludingBasisHedges: reported\(\s*0\.18/);
  assert.match(baseline, /realizedNglPerBbl: reported\(\s*26\.62/);
  assert.match(baseline, /oilDifferentialToWtiPerBbl: reported\(\s*-10\.68/);
});

test("RRC baseline does not fabricate missing product or cost data", () => {
  assert.match(baseline, /naturalGasMmcfPerDay: unavailable/);
  assert.match(baseline, /nglMbblPerDay: unavailable/);
  assert.match(baseline, /oilMbblPerDay: unavailable/);
  assert.match(baseline, /directOperatingExpensePerMcfe: unavailable/);
  assert.match(baseline, /netDebtMillion: unavailable/);
  assert.match(baseline, /dilutedSharesMillion: unavailable/);
});

test("hedge engine supports the required upstream instruments", () => {
  assert.match(hedges, /"swap" \| "collar" \| "three_way_collar" \| "basis_swap"/);
  assert.match(hedges, /fixedPrice/);
  assert.match(hedges, /floorPrice/);
  assert.match(hedges, /soldPutPrice/);
  assert.match(hedges, /ceilingPrice/);
  assert.match(hedges, /fixedBasis/);
});

test("hedge engine returns null instead of guessing incomplete settlements", () => {
  assert.match(hedges, /settlement: null/);
  assert.match(hedges, /Hedge volume is unavailable or invalid/);
  assert.match(hedges, /Three-way collar strikes are incomplete/);
});

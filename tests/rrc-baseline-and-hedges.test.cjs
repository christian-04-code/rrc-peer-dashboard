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

test("RRC baseline captures verified Q1 2026 operating facts", () => {
  assert.match(baseline, /totalProductionBcfePerDay: reported\(\s*2\.207436/);
  assert.match(baseline, /naturalGasMmcfPerDay: reported\(\s*1508\.842/);
  assert.match(baseline, /nglMbblPerDay: reported\(\s*108\.193/);
  assert.match(baseline, /oilMbblPerDay: reported\(\s*8\.239/);
  assert.match(baseline, /realizedGasExDerivativesPerMcf: reported\(\s*5\.18/);
  assert.match(baseline, /realizedNglPerBbl: reported\(\s*26\.62/);
  assert.match(baseline, /realizedOilPerBbl: reported\(\s*63\.3/);
});

test("RRC baseline captures verified cost and capital-structure facts", () => {
  assert.match(baseline, /directOperatingExpensePerMcfe: reported\(\s*0\.14/);
  assert.match(baseline, /gatheringProcessingTransportationPerMcfe: reported\(\s*1\.63/);
  assert.match(baseline, /productionTaxesPerMcfe: reported\(\s*0\.02931/);
  assert.match(baseline, /reportedGaMillion: reported\(\s*45\.351/);
  assert.match(baseline, /reportedInterestExpenseMillion: reported\(\s*19\.419/);
  assert.match(baseline, /balanceSheetNetDebtMillion: reported\(\s*819\.007/);
  assert.match(baseline, /dilutedSharesMillion: reported\(\s*236\.396/);
});

test("RRC baseline does not misclassify accrual expenses as cash inputs", () => {
  assert.match(baseline, /cashGaMillion: unavailable/);
  assert.match(baseline, /cashInterestMillion: unavailable/);
  assert.match(baseline, /carrying-value net debt, not face-value debt/);
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

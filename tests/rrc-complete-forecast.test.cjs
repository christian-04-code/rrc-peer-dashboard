const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(process.cwd(), "lib", "forecast", "scenarios", "rrc-complete.ts"),
  "utf8"
);
const balanceSheet = fs.readFileSync(
  path.join(process.cwd(), "lib", "forecast", "balance-sheet.ts"),
  "utf8"
);
const hedgeBook = fs.readFileSync(
  path.join(process.cwd(), "lib", "forecast", "data", "rrc-hedges.ts"),
  "utf8"
);

test("complete RRC scenario supports both post-2027 strategies", () => {
  assert.match(source, /"maintenance" \| "continued-growth"/);
  assert.match(source, /buildRrcCompleteScenario/);
  assert.match(source, /runRrcCompleteScenario/);
});

test("complete RRC scenario uses filing-backed Q1 2026 anchors", () => {
  assert.match(source, /rrcQ1_2026Baseline\.naturalGasMmcfPerDay/);
  assert.match(source, /value: 0\.14/);
  assert.match(source, /value: 1\.63/);
  assert.match(source, /value: 45\.351/);
  assert.match(source, /value: 19\.419/);
});

test("forward production and pricing assumptions are explicit", () => {
  assert.match(source, /annualTargetBcfePerDay/);
  assert.match(source, /2\.6/);
  assert.match(source, /2\.68/);
  assert.match(source, /value: 0\.18/);
  assert.match(source, /value: -10\.68/);
});

test("balance sheet roll-forward never creates an automatic financing plug", () => {
  assert.match(balanceSheet, /never invents a financing plug/);
  assert.match(balanceSheet, /Ending cash is negative/);
  assert.match(balanceSheet, /netLeverage/);
});

test("hedge book remains source-disciplined until exact rows are loaded", () => {
  assert.match(hedgeBook, /positions: \[\]/);
  assert.match(hedgeBook, /more than 35%/);
  assert.match(hedgeBook, /Do not allocate the aggregate hedged percentage across quarters/);
});

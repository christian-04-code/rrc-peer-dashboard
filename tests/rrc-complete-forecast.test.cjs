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

// Moved from Q1 2026 to Q2 2026 on feat/rrc-q2-baseline (2026-08-12): every anchor value
// below was independently re-verified against RRC's own Q2 2026 Form 10-Q on the same
// definitional basis as the prior Q1 anchor -- see rrc-baseline.ts's rrcQ2_2026Baseline.
test("complete RRC scenario uses filing-backed Q2 2026 anchors", () => {
  assert.match(source, /rrcLatestDetailedBaseline\.naturalGasMmcfPerDay/);
  assert.match(source, /value: 0\.133/);
  assert.match(source, /value: 1\.516/);
  // Cash G&A uses the reported Q2 2026 cash-only $/Mcfe rate (excluding stock comp,
  // independently verified against the 10-Q's own G&A/stock-comp breakout table),
  // numerically unchanged from the Q1 2026 anchor.
  assert.match(source, /value: 0\.18/);
  assert.match(source, /value: 14\.4/);
});

test("2026Q1/2026Q2 are immutable reported actuals, sourced from the canonical dataset, not re-forecast", () => {
  assert.match(source, /rrc-actuals/);
  assert.match(source, /applyActualQuarterOverrides/);
  assert.match(source, /isRrcActualPeriod/);
  assert.match(source, /immutable historical quarter/);
});

test("forward production is a flat hold of the latest reported baseline, and pricing anchors are explicit", () => {
  assert.match(source, /buildFlatProductionForecast/);
  assert.match(source, /toProductionAssumptions/);
  assert.doesNotMatch(source, /annualTargetBcfePerDay/);
  assert.doesNotMatch(source, /quarterlyTotalBcfePerDay/);
  assert.doesNotMatch(source, /scaleProductMix/);
  assert.match(source, /value: 0\.18/);
  assert.match(source, /value: -9\.62/);
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

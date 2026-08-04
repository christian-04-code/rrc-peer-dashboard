const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const derivatives = read("lib/forecast/data/rrc-derivatives.ts");
const settlements = read("lib/forecast/data/rrc-hedge-settlements.ts");
const valuation = read("lib/forecast/valuation.ts");
const valued = read("lib/forecast/scenarios/rrc-valued.ts");

test("RRC derivative schedule preserves exact disclosed gas hedge terms", () => {
  assert.match(derivatives, /volume: 300_000/);
  assert.match(derivatives, /fixedPrice: 4\.06/);
  assert.match(derivatives, /volume: 314_091/);
  assert.match(derivatives, /soldPutPrice: 2\.74/);
  assert.match(derivatives, /floorPrice: 3\.71/);
  assert.match(derivatives, /ceilingPrice: 5\.06/);
  assert.match(derivatives, /volume: 270_000/);
  assert.match(derivatives, /fixedPrice: 4\.05/);
});

test("RRC derivative schedule includes oil, NGL, swaptions, and basis disclosure", () => {
  assert.match(derivatives, /rrc-oil-three-way-apr-sep-2026/);
  assert.match(derivatives, /rrc-c3-swap-apr-sep-2026/);
  assert.match(derivatives, /rrc-c5-swap-apr-jun-2026/);
  assert.match(derivatives, /153_762_500/);
  assert.match(derivatives, /positionLevelPricesAvailable: false/);
  assert.match(derivatives, /not_assumed_exercised/);
});

test("quarterly hedge calculator expands daily disclosed volume by covered days", () => {
  assert.match(settlements, /overlapDays/);
  assert.match(settlements, /position\.volume \* days/);
  assert.match(settlements, /Natural-gas swaptions are excluded unless exercise is confirmed/);
  assert.match(settlements, /Aggregate basis swaps are excluded/);
});

test("valuation engine supports multiple and DCF methods without hidden fallbacks", () => {
  assert.match(valuation, /calculateMultipleValuation/);
  assert.match(valuation, /calculateDcf/);
  assert.match(valuation, /Discount rate must exceed terminal growth rate/);
  assert.match(valuation, /impliedSharePrice/);
});

test("valued RRC scenario provides maintenance and growth-ready outputs", () => {
  assert.match(valued, /runRrcValuedScenario/);
  assert.match(valued, /RrcPost2027Strategy/);
  assert.match(valued, /targetEvToEbitdax: 5\.5/);
  assert.match(valued, /annualFreeCashFlowMillion/);
  assert.match(valued, /multiple/);
  assert.match(valued, /dcf/);
});

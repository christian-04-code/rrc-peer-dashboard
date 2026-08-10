const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("components/dashboard/MarketRibbon.tsx", "utf8");

test("ribbon prioritizes current OilPriceAPI Henry Hub/WTI while keeping EIA detail and Brent", () => {
  assert.match(source, /data\.currentMarket\.henryHub/);
  assert.match(source, /data\.currentMarket\.wti/);
  assert.match(source, /OilPriceAPI · Current Market/);
  assert.match(source, /EIA latest official/);
  assert.match(source, /eia\.get\("brent"\)/);
  assert.doesNotMatch(source, /\?\? 0/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "MarketRibbon.tsx"), "utf8");

test("WTI and Henry Hub prioritize OilPriceAPI's current-market quote from data.currentMarket", () => {
  assert.match(source, /data\.currentMarket\.wti/);
  assert.match(source, /data\.currentMarket\.henryHub/);
  assert.match(source, /current\.status === "ok" && current\.price !== null/);
});

test("source text clearly identifies OilPriceAPI as current market when it's the active source", () => {
  assert.match(source, /OilPriceAPI · Current Market/);
});

test("EIA remains the fallback (and stays visible in the detail text) when OilPriceAPI is unavailable for that commodity", () => {
  assert.match(source, /EIA latest official/);
  assert.match(source, /EIA · Latest Official/);
});

test("24h change renders inline without restructuring the existing button layout (only an additive <small> element)", () => {
  assert.match(source, /formatChange/);
  assert.match(source, /change24hPercent/);
  assert.match(source, /item\.changeText \? <small>\{item\.changeText\}<\/small> : null/);
});

test("Brent has no OilPriceAPI branch at all -- it only ever reads the EIA metric, unchanged behavior", () => {
  const brentSection = source.slice(source.indexOf('const brent = eiaById.get("brent")'));
  assert.match(brentSection, /formatValue\(brent\)/);
  assert.doesNotMatch(brentSection.slice(0, brentSection.indexOf("return items")), /currentMarket/);
});

test("no zero substitution: the ribbon never falls back to displaying 0 for an unavailable commodity", () => {
  assert.doesNotMatch(source, /displayValue: "0"/);
  assert.doesNotMatch(source, /\?\? 0/);
});

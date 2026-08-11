const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workbenchSource = fs.readFileSync(
  path.join(process.cwd(), "components", "forecast", "RrcScenarioWorkbench.tsx"),
  "utf8"
);
const panelSource = fs.readFileSync(
  path.join(process.cwd(), "components", "dashboard", "ForecastWorkspacePanel.tsx"),
  "utf8"
);

// The simplified Forecast page replaced the old read-only "Commodity price assumptions"
// card with exactly two primary commodity price modes (per the product spec): CURRENT
// MARKET (existing OilPriceAPI -> EIA plumbing, unchanged) and CUSTOM (direct user entry).
// These tests assert that two-mode contract instead of the removed CommodityPriceAssumptions
// component and its "read-only" copy.

test("exactly two commodity price modes are offered: current-market and custom", () => {
  assert.match(workbenchSource, /type CommodityMode = "current-market" \| "custom"/);
  assert.match(workbenchSource, /<option value="current-market">Current market<\/option>/);
  assert.match(workbenchSource, /<option value="custom">Custom<\/option>/);
});

test("current-market mode displays the resolved Henry Hub/WTI values from the existing resolveCommoditySources helper (OilPriceAPI-first, EIA-fallback) -- no new provider logic", () => {
  assert.match(workbenchSource, /resolveCommoditySources\(market\.data\)/);
  assert.match(workbenchSource, /from "@\/lib\/forecast\/live-market-prices"/);
  assert.match(workbenchSource, /commoditySources\.henryHub\.value/);
  assert.match(workbenchSource, /commoditySources\.wti\.value/);
});

test("current-market mode is explicitly labeled as spot-price sensitivity, not a forward curve", () => {
  assert.match(workbenchSource, /Spot-price sensitivity -- not a forward curve/);
});

test("custom mode accepts direct Henry Hub, WTI, and NGL $/bbl entry (no futures-strip UI)", () => {
  const customBlockStart = workbenchSource.indexOf("Henry Hub ($/MMBtu)");
  const customBlock = workbenchSource.slice(customBlockStart - 50, customBlockStart + 500);
  assert.match(customBlock, /Henry Hub \(\$\/MMBtu\)/);
  assert.match(customBlock, /WTI \(\$\/bbl\)/);
  assert.match(customBlock, /NGL realization \(\$\/bbl\)/);
  assert.doesNotMatch(customBlock, /strip|forward curve|futures/i);
});

test("the custom NGL $/bbl input is sent directly as nglPerBbl -- no separate percent-of-WTI UI mechanism was added", () => {
  assert.match(workbenchSource, /nglPerBbl:\s*parsedOrUndefined\(customNgl\)/);
  assert.doesNotMatch(workbenchSource, /nglRealizationPctOfWti/);
});

test("no commodity prices are hardcoded in the current-market display path -- only derived from resolveCommoditySources' output fields", () => {
  const displayStart = workbenchSource.indexOf('commodityMode === "current-market"');
  const displayBlock = workbenchSource.slice(displayStart, workbenchSource.indexOf("Spot-price sensitivity", displayStart));
  assert.doesNotMatch(displayBlock, /\b3\.75\b/);
  assert.doesNotMatch(displayBlock, /\b65(\.0+)?\b/);
});

test("no direct OilPriceAPI client call was added to either Forecast component", () => {
  for (const [name, source] of [
    ["RrcScenarioWorkbench.tsx", workbenchSource],
    ["ForecastWorkspacePanel.tsx", panelSource]
  ]) {
    assert.doesNotMatch(source, /lib\/oilpriceapi\/client/, `${name} must not import the OilPriceAPI client`);
    assert.doesNotMatch(source, /OIL_PRICE_API/, `${name} must not reference the OilPriceAPI env var`);
    assert.doesNotMatch(source, /api\.oilpriceapi\.com/, `${name} must not call OilPriceAPI directly`);
  }
});

test("RrcScenarioWorkbench resolves its own live commodity data (self-sufficient) rather than requiring props from its caller", () => {
  assert.doesNotMatch(workbenchSource, /export function RrcScenarioWorkbench\([^)]+\)/, "the component should take no props");
  assert.match(workbenchSource, /export function RrcScenarioWorkbench\(\)/);
  const standaloneForecastPage = fs.readFileSync(path.join(process.cwd(), "app", "forecast", "page.tsx"), "utf8");
  assert.match(standaloneForecastPage, /<RrcScenarioWorkbench \/>/);
});

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

function section(name) {
  const start = workbenchSource.indexOf(name);
  assert.notEqual(start, -1, `expected to find ${name} in RrcScenarioWorkbench.tsx`);
  return workbenchSource.slice(start, start + 3000);
}

test("1. Henry Hub commodity input is visible in the Commodity price assumptions section", () => {
  const commoditySection = section("function CommodityPriceAssumptions");
  assert.match(commoditySection, /label:\s*"Henry Hub",\s*data:\s*henryHub/);
});

test("2. WTI commodity input is visible in the Commodity price assumptions section", () => {
  const commoditySection = section("function CommodityPriceAssumptions");
  assert.match(commoditySection, /label:\s*"WTI",\s*data:\s*wti/);
});

test("3. OilPriceAPI values display with the exact 'Current Market' label, never blurred with EIA/modeled", () => {
  assert.match(workbenchSource, /current_market:\s*"OilPriceAPI · Current Market"/);
});

test("4. EIA fallback displays with the exact 'Latest Official / Delayed' label", () => {
  assert.match(workbenchSource, /official_delayed:\s*"EIA · Latest Official \/ Delayed"/);
});

test("5. Modeled fallback preserves the app's existing 'Management Sensitivity' terminology", () => {
  assert.match(workbenchSource, /modeled:\s*"Management Sensitivity"/);
});

test("6. The model input / price actually used for this scenario run is visible, not just an abstract 'current market' figure", () => {
  const commoditySection = section("function CommodityPriceAssumptions");
  assert.match(commoditySection, /formatCommodityPrice\(data\.value, data\.unit\)/);
  assert.match(commoditySection, /Model input for this scenario run/);
});

test("7. 24h percent change renders when supplied, using the already-normalized change24hPercent field (no re-derivation)", () => {
  assert.match(workbenchSource, /formatChange24h\(data\.change24hPercent\)/);
  assert.match(workbenchSource, /\{change \? <span[^>]*>\{change\}<\/span> : null\}/);
});

test("8. Missing 24h change renders nothing (null), never a fabricated 0", () => {
  const fnBody = section("function formatChange24h");
  assert.match(fnBody, /if \(percent === null\) return null;/);
});

test("9. No commodity prices are hardcoded in the new commodity-assumptions UI code -- only derived from resolveCommoditySources' output fields", () => {
  const displayLogic = fs
    .readFileSync(path.join(process.cwd(), "components", "forecast", "RrcScenarioWorkbench.tsx"), "utf8")
    .slice(workbenchSource.indexOf("function formatCommodityPrice"), workbenchSource.indexOf("export function RrcScenarioWorkbench"));

  // The known modeled-fallback constants ($3.75 Henry Hub / $65 WTI, defined only in
  // rrc-complete.ts) must never be duplicated here -- that would be exactly the kind
  // of drift-prone fabrication the app avoids everywhere else.
  assert.doesNotMatch(displayLogic, /\b3\.75\b/);
  assert.doesNotMatch(displayLogic, /\b65(\.0+)?\b/);
  // Price rendering must always go through the resolved data object, never a literal.
  assert.match(displayLogic, /formatCommodityPrice\(value: number \| null, unit: string \| null\)/);
  assert.doesNotMatch(displayLogic, /\$\{?\d+\.\d{2}\}?/, "no inline dollar-amount literal should appear");
});

test("10. No direct OilPriceAPI client call was added to either Forecast component", () => {
  for (const [name, source] of [
    ["RrcScenarioWorkbench.tsx", workbenchSource],
    ["ForecastWorkspacePanel.tsx", panelSource]
  ]) {
    assert.doesNotMatch(source, /lib\/oilpriceapi\/client/, `${name} must not import the OilPriceAPI client`);
    assert.doesNotMatch(source, /OIL_PRICE_API/, `${name} must not reference the OilPriceAPI env var`);
    assert.doesNotMatch(source, /api\.oilpriceapi\.com/, `${name} must not call OilPriceAPI directly`);
  }
});

test("11. RrcScenarioWorkbench renders the section only when commoditySources is supplied -- the standalone /forecast route (no props) is byte-for-byte unaffected", () => {
  assert.match(workbenchSource, /\{commoditySources \? <CommodityPriceAssumptions henryHub=\{commoditySources\.henryHub\} wti=\{commoditySources\.wti\} \/> : null\}/);
  const standaloneForecastPage = fs.readFileSync(path.join(process.cwd(), "app", "forecast", "page.tsx"), "utf8");
  assert.match(standaloneForecastPage, /<RrcScenarioWorkbench \/>/);
});

test("12. ForecastWorkspacePanel wires commoditySources from the existing resolveCommoditySources helper (no new provider logic)", () => {
  assert.match(panelSource, /resolveCommoditySources\(market\.data\)/);
  assert.match(panelSource, /from "@\/lib\/forecast\/live-market-prices"/);
});

test("Price mode is read-only, and the UI states plainly that custom price entry requires a separate modeling change (no new override mechanism was invented)", () => {
  assert.match(workbenchSource, /Price mode: Current market \(read-only\)/);
  assert.match(workbenchSource, /Custom price entry is not available yet -- it requires a separate modeling change\./);
});

test("Commodity badge/border styling reuses the existing Scenario Workbench visual language (same pill/border-radius pattern as the Production assumption badge)", () => {
  const commoditySection = section("function CommodityPriceAssumptions");
  assert.match(commoditySection, /borderRadius: 999/);
  assert.match(commoditySection, /border: "1px solid rgba\(128,128,128,0\.35\)"/);
  // Desktop horizontal fit / mobile stacking reuses the same responsive grid already used for the preset controls above.
  assert.match(commoditySection, /gridTemplateColumns: "repeat\(auto-fit,minmax\(220px,1fr\)\)"/);
});

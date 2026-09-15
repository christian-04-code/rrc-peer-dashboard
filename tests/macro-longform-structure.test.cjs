const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const panelSource = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "MacroPanel.tsx"), "utf8");

// The long-form restructure (matching the pre-tab e61e0ac architecture) mounts
// every section unconditionally, in one continuous scroll, instead of gating
// them behind a Phase 6C-style topic tab. These ids are what the quick-jump
// nav scrolls to; each must exist exactly once.
const SECTION_IDS = ["gas-balance", "storage", "map-rigs", "supply", "lng", "demand", "ngl", "appalachia", "eia-outlook"];

test("tab-gating (per-topic React state + conditional topic === rendering) is gone", () => {
  assert.doesNotMatch(panelSource, /useState<Topic>/, "the old per-topic selection state must not return");
  assert.doesNotMatch(panelSource, /topic === "/, "no section may be conditionally rendered on a selected topic -- every section must always render");
  assert.doesNotMatch(panelSource, /aria-pressed=\{topic/, "no tab-style aria-pressed selection state should remain");
  assert.doesNotMatch(panelSource, /setTopic/, "no tab-switching state setter should remain");
});

test("every long-form section anchor id is present exactly once, so quick-jump links and scroll-to-driver land on a real, unique target", () => {
  for (const id of SECTION_IDS) {
    const matches = panelSource.match(new RegExp(`id="${id}"`, "g")) ?? [];
    assert.equal(matches.length, 1, `expected exactly one id="${id}" in MacroPanel.tsx, found ${matches.length}`);
  }
});

test("the quick-jump nav only links to section ids that actually exist in the page, and scrolling does not hide/unmount any section", () => {
  const start = panelSource.indexOf("const QUICK_JUMP");
  assert.ok(start >= 0, "QUICK_JUMP array not found");
  const end = panelSource.indexOf("];", start);
  const block = panelSource.slice(start, end);
  const ids = [...block.matchAll(/id:\s*"([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 8, `expected at least 8 quick-jump items, found ${ids.length}`);
  for (const id of ids) {
    assert.match(panelSource, new RegExp(`id="${id}"`), `quick-jump item "${id}" has no matching section in the page`);
  }
  assert.match(panelSource, /function scrollToSection\(id: string\)/, "quick-jump must scroll to an anchor, not toggle visibility");
  assert.match(panelSource, /document\.getElementById\(id\)\?\.scrollIntoView/, "must use scrollIntoView, not a mount/unmount pattern");
  assert.match(panelSource, /onClick=\{\(\) => scrollToSection\(item\.id\)\}/, "quick-jump buttons must call scrollToSection, not a state setter");
});

test("every existing visualization component/chart remains mounted in the long-form page -- nothing was replaced with a summary card", () => {
  assert.match(panelSource, /<MacroEnergyMap data=/, "interactive energy map + rig activity must remain mounted");
  assert.match(panelSource, /Lower 48 storage current year, prior year, five-year average and range/, "storage chart must remain");
  assert.match(panelSource, /<RegionalStorageTable regions=/, "regional storage table must remain");
  assert.match(panelSource, /U\.S\. dry natural gas production, actual and EIA STEO forecast/, "production chart must remain");
  assert.match(panelSource, /<StateProductionRanking states=/, "state production ranking must remain");
  assert.match(panelSource, /U\.S\. LNG exports, actual and EIA STEO forecast/, "LNG chart must remain");
  assert.match(panelSource, /<DemandChart demand=/, "demand chart must remain");
  assert.match(panelSource, /U\.S\. propane inventory history/, "propane/NGL chart must remain");
  assert.match(panelSource, /PA \+ WV \+ OH marketed production history/, "Appalachia chart must remain");
  assert.match(panelSource, /<MacroRiskWidget/, "Macro Risk Widget must remain");
  assert.match(panelSource, /<EiaOutlookModule/, "EIA Outlook module must remain");
});

test("MacroRiskWidget's driver click scrolls to the relevant long-form section instead of switching a tab", () => {
  assert.match(panelSource, /onViewDriver=\{\(driver\) => scrollToSection\(RISK_DRIVER_SECTION\[driver\]\)\}/);
});

test("the Baker Hughes report date in the Map & Rigs section is still dynamic, not hardcoded", () => {
  assert.match(panelSource, /formatWeekEnding\(getRigDataset\(\)\.source\.reportDate\)/);
});

test("the long-form restructure touched only MacroPanel.tsx's composition -- same data hooks, same downstream components, no backend/data contract replaced", () => {
  for (const hook of ["useMarketData", "useMacroFundamentals", "useMacroSteo", "useMacroRisk", "getRigDataset"]) {
    assert.match(panelSource, new RegExp(hook), `expected ${hook} to still be used -- no data source may be swapped`);
  }
  const untouchedFiles = [
    "components/dashboard/MacroEnergyMap.tsx",
    "components/dashboard/BasinRigActivity.tsx",
    "components/dashboard/MacroVisuals.tsx",
    "components/dashboard/MacroRiskWidget.tsx",
    "components/dashboard/EiaOutlookModule.tsx",
    "data/rigs/rig-count.json"
  ];
  for (const file of untouchedFiles) {
    assert.ok(fs.existsSync(path.join(process.cwd(), file)), `${file} must still exist`);
  }
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const homeDashboardSource = fs.readFileSync(path.join(process.cwd(), "components", "HomeDashboard.tsx"), "utf8");

test("Sources is absent from the primary navigation and no dead SourcesPanel wiring remains", () => {
  assert.doesNotMatch(homeDashboardSource, />Sources</);
  assert.doesNotMatch(homeDashboardSource, /SourcesPanel/);
  assert.doesNotMatch(homeDashboardSource, /"sources"/);
});

test("Companies/Peers is removed from the primary navigation", () => {
  assert.doesNotMatch(homeDashboardSource, />Companies</);
  assert.doesNotMatch(homeDashboardSource, /"peers"/);
  assert.doesNotMatch(homeDashboardSource, /PeersPanel/);
});

test("Forecast is present in the primary navigation and opens the consolidated forecast workspace", () => {
  assert.match(homeDashboardSource, />Forecast</);
  assert.match(homeDashboardSource, /ForecastWorkspacePanel/);
});

test("top nav renders exactly Overview, Forecast, Macro, News, in that order", () => {
  const navMatch = homeDashboardSource.match(/<nav aria-label="Primary navigation">([\s\S]*?)<\/nav>/);
  assert.ok(navMatch, "primary navigation block should exist");
  const labels = [...navMatch[1].matchAll(/>([A-Za-z]+)<\/button>/g)].map((match) => match[1]);
  assert.deepEqual(labels, ["Overview", "Forecast", "Macro", "News"]);
  assert.doesNotMatch(navMatch[1], />Map</);
});

test("the old dashboard-compact ForecastPanel, FinancePanel, and FinancialsPanel component files are removed (consolidated, not duplicated)", () => {
  for (const file of ["FinancePanel.tsx", "FinancialsPanel.tsx", "ForecastPanel.tsx"]) {
    assert.equal(fs.existsSync(path.join(process.cwd(), "components", "dashboard", file)), false, `${file} should be removed`);
  }
});

test("PeersPanel component and its underlying peer-comparison data are preserved on disk even though unrouted", () => {
  assert.ok(fs.existsSync(path.join(process.cwd(), "components", "dashboard", "PeersPanel.tsx")));
  assert.ok(fs.existsSync(path.join(process.cwd(), "data", "historical.json")));
});

test("the standalone /forecast workbench route is untouched and still renders RrcScenarioWorkbench", () => {
  const forecastPageSource = fs.readFileSync(path.join(process.cwd(), "app", "forecast", "page.tsx"), "utf8");
  assert.match(forecastPageSource, /RrcScenarioWorkbench/);
});

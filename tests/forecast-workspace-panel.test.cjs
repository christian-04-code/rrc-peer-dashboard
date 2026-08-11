const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(process.cwd(), "components", "dashboard", "ForecastWorkspacePanel.tsx"),
  "utf8"
);

test("ForecastWorkspacePanel lets the user select one company at a time", () => {
  assert.match(source, /CompanySelector/);
  assert.match(source, /useState<Ticker>\(defaultTicker\)/);
});

test("ForecastWorkspacePanel reuses the existing RrcScenarioWorkbench rather than a new forecast engine", () => {
  assert.match(source, /RrcScenarioWorkbench/);
  assert.doesNotMatch(source, /runForecastScenario|runRrcCompleteScenario|new.*ForecastEngine/);
});

test("ForecastWorkspacePanel does not fabricate a forecast for tickers the engine does not support", () => {
  assert.match(source, /FORECAST_SUPPORTED_TICKERS/);
  assert.match(source, /unavailable/i);
  assert.match(source, /&quot;--&quot;|"--"/);
});

const rrcWorkbenchSource = fs.readFileSync(
  path.join(process.cwd(), "components", "forecast", "RrcScenarioWorkbench.tsx"),
  "utf8"
);

test("RrcScenarioWorkbench is self-sufficient: it resolves live commodity prices itself via useMarketData, rather than requiring ForecastWorkspacePanel to compute and drill them down as props", () => {
  assert.match(rrcWorkbenchSource, /useMarketData/);
  assert.match(rrcWorkbenchSource, /extractLiveMarketMetricsFromMarketResponse\(market\.data\)/);
  assert.match(rrcWorkbenchSource, /resolveCommoditySources\(market\.data\)/);
  // No commodity props expected on the call site -- confirms the simplification actually
  // removed the prop-drilling rather than leaving unused plumbing behind.
  assert.match(source, /<RrcScenarioWorkbench \/>/);
});

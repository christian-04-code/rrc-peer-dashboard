const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routeSource = fs.readFileSync(path.join(process.cwd(), "app", "api", "market", "route.ts"), "utf8");
// Phase 6D: the metric definitions moved out of the route file into a shared
// lib/market/build-market-metrics.ts (so the Macro risk engine's orchestration
// layer can reuse them without a second, divergent set of EIA fetch calls).
// The route itself now just calls buildNormalizedMarketMetrics().
const buildMetricsSource = fs.readFileSync(path.join(process.cwd(), "lib", "market", "build-market-metrics.ts"), "utf8");
const panelSource = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "MacroPanel.tsx"), "utf8");

const REQUIRED_METRIC_IDS = [
  "henry_hub",
  "wti",
  "brent",
  "storage",
  "lng_exports",
  "dry_gas_production",
  "propane_stocks"
];

test("/api/market's route calls the shared metric builder, and every metric id the Macro tab depends on is defined there (guards against a renamed/dropped id silently emptying the panel)", () => {
  assert.match(routeSource, /buildNormalizedMarketMetrics/, "app/api/market/route.ts must call the shared builder, not redefine metrics inline");
  for (const id of REQUIRED_METRIC_IDS) {
    assert.match(buildMetricsSource, new RegExp(`id: "${id}"`), `lib/market/build-market-metrics.ts is missing definition for "${id}"`);
  }
});

test("MacroPanel's market-pulse strip requests exactly the ids /api/market returns, so every supported metric visibly populates", () => {
  const pulseIdsMatch = panelSource.match(/const PULSE_IDS = \[([^\]]+)\];/);
  assert.ok(pulseIdsMatch, "PULSE_IDS array not found in MacroPanel.tsx");
  const pulseIds = pulseIdsMatch[1].split(",").map((entry) => entry.trim().replace(/"/g, "")).filter(Boolean);
  assert.deepEqual(pulseIds.sort(), [...REQUIRED_METRIC_IDS].sort());
});

test("MacroPanel looks up each non-pulse-strip metric (storage/lng/production/propane/henry hub) by its exact /api/market id", () => {
  assert.match(panelSource, /byId\.get\("storage"\)/);
  assert.match(panelSource, /byId\.get\("lng_exports"\)/);
  assert.match(panelSource, /byId\.get\("dry_gas_production"\)/);
  assert.match(panelSource, /byId\.get\("propane_stocks"\)/);
  assert.match(panelSource, /byId\.get\("henry_hub"\)/);
});

test("PulseMetric never substitutes a missing value with 0 -- formatMetricValue/formatValue paths render '--' instead", () => {
  const analyticsSource = fs.readFileSync(path.join(process.cwd(), "lib", "market", "macro-analytics.ts"), "utf8");
  assert.match(analyticsSource, /if \(!metric \|\| metric\.status !== "ok" \|\| metric\.value === null\) return "--";/);
  assert.doesNotMatch(analyticsSource, /\?\? 0/);
});

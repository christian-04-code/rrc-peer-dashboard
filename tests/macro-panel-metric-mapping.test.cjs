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

test("PulseMetric distinguishes a genuine upstream fetch error from an ordinary '--' placeholder (a real EIA failure must never look identical to 'no observation yet')", () => {
  assert.match(
    panelSource,
    /const hasError = !hasCurrent && metric\?\.status === "unavailable" && Boolean\(metric\.error\);/,
    "PulseMetric must detect a real per-metric fetch error (status unavailable + a captured .error), not just an absent metric"
  );
  assert.match(panelSource, /Source error: \$\{metric!\.error\}/, "the error message itself must render, not just a generic unavailable state");
  assert.match(
    panelSource,
    /freshness-dot \$\{hasCurrent \? "current" : hasError \? "error" : metric\?\.freshness \?\? "unavailable"\}/,
    "the freshness dot must visually distinguish a source error from ordinary lagged/stale/unavailable states"
  );
});

test("the freshness-dot 'error' state has real CSS (not an unstyled class that silently falls back to the default gray dot)", () => {
  const cssSource = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
  assert.match(cssSource, /\.freshness-dot\.error\s*\{\s*background:\s*var\(--negative\);?\s*\}/);
});

test("Data Health is honestly scoped to live sources only -- its label and healthy-case detail must not imply Rigs (manually imported, never live) is covered", () => {
  assert.match(panelSource, /LIVE DATA HEALTH/, "the header must not claim to cover the full Macro dataset when it only checks live EIA/OilPriceAPI/STEO sources");
  assert.match(
    panelSource,
    /Rigs is manually imported and reported separately below/,
    "the healthy-case detail text must disclose that Rigs sits outside this badge's scope, not imply blanket coverage"
  );
});

test("computeDataHealth cannot report Healthy while any tracked source has failed or gone stale (a source error or stale observation must never be masked)", () => {
  assert.match(panelSource, /if \(failed\.length > 0\)/, "a failed source must short-circuit before the healthy branch can run");
  assert.match(panelSource, /if \(stale\.length > 0\)/, "a stale source must short-circuit before the healthy branch can run");
  // "lagged" must never appear in the failed/stale accumulation logic -- it's EIA's own normal
  // publication cadence (confirmed in production), not a fault, and must not downgrade the badge.
  const healthFnMatch = panelSource.match(/function computeDataHealth[\s\S]*?\n}\n/);
  assert.ok(healthFnMatch, "computeDataHealth function body not found");
  assert.doesNotMatch(healthFnMatch[0], /freshness === "lagged"/, "lagged must not be treated as a health failure");
});

test("the Data Sources & Freshness table includes both EIA STEO (forecast/monthly) and Baker Hughes Rigs (manual) rows, each derived from real data -- not silently omitted from the one place a user can audit every source at once", () => {
  assert.match(panelSource, /EIA STEO · Outlook \(forecast\)/);
  assert.match(panelSource, /steoObservation/, "STEO's observation date must come from the real snapshot fetchedAt, not a hardcoded string");
  assert.match(panelSource, /Baker Hughes · Rigs/);
  assert.match(
    panelSource,
    /formatWeekEnding\(getRigDataset\(\)\.source\.reportDate\)/,
    "the Rigs freshness row must read the real imported report date, not a hardcoded one"
  );
  assert.match(panelSource, /macro-freshness-status manual/, "Rigs must render as its own distinct 'Manual' status, not 'Current'/'Lagged'/'Stale'/'Source error'");
});

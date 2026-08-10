const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

function readComponent(...segments) {
  return fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");
}

test("ForecastWorkspacePanel no longer polls FMP; commodity inputs are EIA-only again", () => {
  const source = readComponent("components", "dashboard", "ForecastWorkspacePanel.tsx");
  assert.doesNotMatch(source, /useFmpQuotes/);
  assert.doesNotMatch(source, /extractLiveMarketMetricsWithFallback/);
  assert.match(source, /extractLiveMarketMetrics\(market\.data\?\.metrics\)/);
});

test("HomeDashboard's forecast chart commodity prices are EIA-only again (FMP removed from that flow)", () => {
  const source = readComponent("components", "HomeDashboard.tsx");
  assert.doesNotMatch(source, /buildCurrentMarketPricesFromFmpAndEia/);
  assert.match(source, /buildCurrentMarketPricesFromMetrics\(market\.data\?\.metrics\)/);
});

test("MarketRibbon still sources Henry Hub/WTI/Brent from EIA (useMarketData) and labels itself delayed", () => {
  const source = readComponent("components", "dashboard", "MarketRibbon.tsx");
  assert.match(source, /useMarketData/);
  assert.match(source, /Delayed energy market data/);
  assert.doesNotMatch(source, /useFmpQuotes|useFinnhubQuotes/);
});

test("the forecast engine's live-commodity notes text says 'Latest official/delayed' for EIA-sourced values, not 'Current-market'", () => {
  const { buildCurrentMarketPrices } = load("lib/forecast/live-market-prices.ts");
  const result = buildCurrentMarketPrices({
    henryHub: { value: 3.5, period: "2026-08-07", fetchedAt: "2026-08-10T00:00:00.000Z", source: "U.S. EIA (RNGWHHD)" },
    wti: { value: 65, period: "2026-08-07", fetchedAt: "2026-08-10T00:00:00.000Z", source: "U.S. EIA (PET.RWTC.D)" }
  });
  assert.match(result.henryHubPerMmbtu.source.notes, /Latest official\/delayed/);
  assert.doesNotMatch(result.henryHubPerMmbtu.source.notes, /^Current-market/);
  assert.match(result.henryHubPerMmbtu.source.notes, /not a real-time quote/i);
  assert.match(result.wtiPerBbl.source.notes, /Latest official\/delayed/);
});

test("the FMP client/route/hook still exist on disk (preserved for future entitlement) but are not imported by any live UI component", () => {
  assert.ok(fs.existsSync(path.join(process.cwd(), "lib", "fmp", "client.ts")));
  assert.ok(fs.existsSync(path.join(process.cwd(), "app", "api", "quotes", "route.ts")));
  assert.ok(fs.existsSync(path.join(process.cwd(), "lib", "market", "use-fmp-quotes.ts")));

  const componentsDir = path.join(process.cwd(), "components");
  const offenders = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
        const source = fs.readFileSync(full, "utf8");
        if (/use-fmp-quotes|useFmpQuotes/.test(source)) offenders.push(full);
      }
    }
  })(componentsDir);
  assert.deepEqual(offenders, [], "no component should still reference the FMP quotes hook");
});

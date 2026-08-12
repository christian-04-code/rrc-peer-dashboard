const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const {
  calculatePctChange,
  normalizeDemand,
  normalizeRegionalStorage,
  normalizeStateProduction
} = load("lib/market/macro-fundamentals.ts");
const { getStorageRegionForState } = load("lib/market/storage-regions.ts");

const fetchedAt = "2026-08-10T12:00:00.000Z";
const table = (rows) => ({ rows, fetchedAt });
const row = (period, value, series, extra = {}) => ({ period, value, series, ...extra });

test("official state-to-storage-region mapping is explicit and leaves non-covered states unmapped", () => {
  assert.equal(getStorageRegionForState("PA"), "east");
  assert.equal(getStorageRegionForState("oh"), "east");
  assert.equal(getStorageRegionForState("TX"), "southCentral");
  assert.equal(getStorageRegionForState("CO"), "mountain");
  assert.equal(getStorageRegionForState("CA"), "pacific");
  assert.equal(getStorageRegionForState("AK"), null);
  assert.equal(getStorageRegionForState("HI"), null);
});

test("regional storage computes weekly, year-over-year, and complete five-year comparisons", () => {
  const east = "NW2_EPG0_SWO_R31_BCF";
  const regions = normalizeRegionalStorage(table([
    row("2026-08-07", 950, east),
    row("2026-07-31", 925, east),
    row("2025-08-08", 900, east),
    row("2024-08-09", 950, east),
    row("2023-08-11", 1000, east),
    row("2022-08-12", 1050, east),
    row("2021-08-13", 1100, east)
  ]));

  assert.equal(regions.east.status, "ok");
  assert.equal(regions.east.current, 950);
  assert.equal(regions.east.weeklyChange, 25);
  assert.equal(regions.east.yearAgo, 900);
  assert.ok(Math.abs(regions.east.yearAgoPct - 5.5555555556) < 0.0001);
  assert.equal(regions.east.fiveYearAverage, 1000);
  assert.equal(regions.east.fiveYearPct, -5);
});

test("missing regional storage remains unavailable and is never converted to zero", () => {
  const regions = normalizeRegionalStorage(table([
    row("2026-08-07", 0, "NW2_EPG0_SWO_R31_BCF")
  ]));

  assert.equal(regions.east.status, "ok");
  assert.equal(regions.east.current, 0, "a returned zero remains a real observation");
  assert.equal(regions.midwest.status, "unavailable");
  assert.equal(regions.midwest.current, null);
  assert.equal(regions.midwest.history.length, 0);
});

test("state production derives dynamic state metrics and preserves absent states as absent", () => {
  const productionRows = Array.from({ length: 13 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 6 - index, 1));
    const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return row(period, 1300 - index * 25, "ignored", { "area-name": "Pennsylvania" });
  });
  productionRows.push(row("2026-07", 0, "ignored", { "area-name": "West Virginia" }));
  const states = normalizeStateProduction(table(productionRows));

  assert.equal(states.PA.current, 1300);
  assert.equal(states.PA.priorMonth, 1275);
  assert.ok(Math.abs(states.PA.monthOverMonthPct - (25 / 1275) * 100) < 0.0001);
  assert.equal(states.PA.yearAgo, 1000);
  assert.equal(states.PA.yearOverYearPct, 30);
  assert.equal(states.WV.current, 0);
  assert.equal(states.TX, undefined, "missing states are not fabricated with zero values");
});

test("state production uses EIA's stable duoarea geography code when area-name is absent", () => {
  const states = normalizeStateProduction(table([
    row("2026-05", 777000, "N9050PA2", { duoarea: "SPA" }),
    row("2025-05", 700000, "N9050PA2", { duoarea: "SPA" })
  ]));

  assert.equal(states.PA.stateName, "Pennsylvania");
  assert.equal(states.PA.current, 777000);
  assert.equal(states.PA.yearAgo, 700000);
  assert.equal(states.PA.yearOverYearPct, 11);
});

test("demand groups the four official end-use series and exposes missing series explicitly", () => {
  const demand = normalizeDemand(table([
    row("2026-06", 800, "NG.N3045US2.M"),
    row("2026-05", 780, "N3045US2"),
    row("2026-06", 600, "N3035US2")
  ]));

  assert.equal(demand.electricPower.status, "ok");
  assert.deepEqual(demand.electricPower.history.map(({ value }) => value), [800, 780]);
  assert.equal(demand.industrial.status, "ok");
  assert.equal(demand.residential.status, "unavailable");
  assert.equal(demand.residential.period, null);
});

test("percentage change is unavailable for missing and zero comparison bases", () => {
  assert.equal(calculatePctChange(10, 0), null);
  assert.equal(calculatePctChange(null, 10), null);
  assert.equal(calculatePctChange(15, 10), 50);
});

test("interactive map exposes both metrics, semantic storage labeling, and pointer/keyboard detail controls", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "MacroEnergyMap.tsx"), "utf8");
  assert.match(source, /states-albers-10m\.json/, "map uses a real U.S. state topology");
  assert.match(source, />Storage</);
  assert.match(source, />Production</);
  assert.match(source, />YoY change</);
  assert.match(source, /getStorageRegionForState/);
  assert.match(source, /region—not separately/);
  assert.match(source, /onMouseEnter/);
  assert.match(source, /onFocus/);
  assert.match(source, /onClick/);
  assert.match(source, /onKeyDown/);
  assert.match(source, /selected/);
  assert.match(source, /Regional storage history/);
  assert.match(source, /State production history/);
});

test("Macro renders the required evidence chart datasets before the deterministic snapshot", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "MacroPanel.tsx"), "utf8");
  const chartLabels = [
    "Lower 48 storage current year, prior year, five-year average and range",
    "U.S. dry natural gas production history",
    "U.S. LNG exports history",
    "U.S. propane inventory history"
  ];
  for (const label of chartLabels) assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(source, /<DemandChart demand=/);
  assert.match(source, /<RegionalStorageTable regions=/);
  assert.match(source, /<StateProductionRanking states=/);
  assert.ok(source.indexOf("07 · NGL") < source.indexOf("09 · MACRO SNAPSHOT"));
  assert.match(source, /Sources: U\.S\. EIA · OilPriceAPI/);
  assert.match(source, /Week ending/);
  assert.match(source, /buildRrcMacroRisk/);
  assert.match(source, /rrcRisk\.title/);
  assert.doesNotMatch(source, /RRC ENERGY FUNDAMENTALS|02 · WEEKLY CENTERPIECE|OVERALL RRC MACRO SETUP/);
});

test("Macro cleanup uses concise source copy and existing accent treatments", () => {
  const panel = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "MacroPanel.tsx"), "utf8");
  const map = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "MacroEnergyMap.tsx"), "utf8");
  const css = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
  assert.match(panel, /U\.S\. EIA · EIA APIs/);
  assert.match(panel, /Regional Working Gas Storage vs\. Five-Year Average/);
  assert.match(panel, /Official EIA regions/);
  assert.match(panel, /macro-source-accent/);
  assert.match(map, /<p>Source: U\.S\. EIA<\/p>/);
  assert.doesNotMatch(map, /distinct from the national dry-production series/);
  assert.match(css, /\.macro-card-title span\.macro-source-accent\s*\{[^}]*#75c7ee/);
  assert.match(css, /\.rrc-macro-risk-label em\s*\{[^}]*var\(--negative\)/);
  assert.match(css, /\.macro-regional-row\.header\s*\{[^}]*#75c7ee/);
});

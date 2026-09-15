const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const panelSource = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "MacroPanel.tsx"), "utf8");
const widgetSource = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "MacroRiskWidget.tsx"), "utf8");
const outlookSource = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "EiaOutlookModule.tsx"), "utf8");
const mapSource = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "MacroEnergyMap.tsx"), "utf8");
const riskRouteSource = fs.readFileSync(path.join(process.cwd(), "app", "api", "macro", "risk", "route.ts"), "utf8");
const orchestrationRepoSource = fs.readFileSync(path.join(process.cwd(), "lib", "market", "persistence", "orchestration-repo.ts"), "utf8");
const orchestrateDailySource = fs.readFileSync(path.join(process.cwd(), "lib", "market", "macro-orchestrate-daily.ts"), "utf8");
const schemaSource = fs.readFileSync(path.join(process.cwd(), "lib", "market", "persistence", "schema.sql"), "utf8");

test("the Macro page renders a top-level 'Last Updated' box", () => {
  assert.match(panelSource, />LAST UPDATED</);
});

test("'Last Updated' is sourced from persisted Macro orchestration metadata, never from Date.now()/the browser's current time", () => {
  assert.match(panelSource, /macroRisk\.data\?\.lastOrchestrationAt/);
  assert.match(panelSource, /formatRefreshTimestamp\(macroRisk\.data\?\.lastOrchestrationAt\)/);
  // The old ambiguous "Market API generated" label (effectively "when this request was served") is gone.
  assert.doesNotMatch(panelSource, /Market API generated/);
});

test("getLatestOrchestrationTimestamp is genuinely cron-exclusive -- its own table, written only at the end of a successful /api/cron/macro run, never from macro_steo_snapshots (which Phase 6C's /api/macro/steo route also opportunistically upserts on ordinary page views)", () => {
  assert.match(orchestrationRepoSource, /FROM macro_orchestration_runs/);
  assert.match(orchestrationRepoSource, /if \(!latest\) return null;/);
  // The doc comment may reference macro_steo_snapshots to explain why it's NOT used; the actual query must not.
  assert.doesNotMatch(orchestrationRepoSource, /pool\.query\(`[^`]*macro_steo_snapshots/);
});

test("macro_orchestration_runs is written to from exactly one place: the end of a successful runMacroDailyOrchestration -- never from a browser-facing route", () => {
  assert.match(orchestrateDailySource, /recordOrchestrationRun\(pool,/);
  const riskRouteHasWrite = riskRouteSource.includes("recordOrchestrationRun");
  const steoRouteSource = fs.readFileSync(path.join(process.cwd(), "app", "api", "macro", "steo", "route.ts"), "utf8");
  assert.equal(riskRouteHasWrite, false, "the browser-facing risk route must never write an orchestration-run row");
  assert.doesNotMatch(steoRouteSource, /recordOrchestrationRun/, "the opportunistic STEO route must never write an orchestration-run row either");
});

test("macro_orchestration_runs is declared in schema.sql as its own idempotent table (append-only, not upserted)", () => {
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS macro_orchestration_runs/);
});

test("formatRefreshTimestamp (system refresh timestamps) is used for wall-clock instants; formatDataDate/formatWeekEnding (data observations) are used for source periods -- never a raw ISO string or bare Date.toLocaleString() in the Macro UI", () => {
  for (const source of [panelSource, widgetSource, outlookSource, mapSource]) {
    assert.doesNotMatch(source, /new Date\([^)]*\)\.toLocaleString\(\)/, "no bare browser-local toLocaleString() left for a refresh timestamp");
  }
});

test("every Macro data-period display goes through the shared UTC-anchored formatters, not ad hoc date math", () => {
  for (const source of [panelSource, widgetSource, outlookSource, mapSource]) {
    assert.match(source, /format(DataDate|WeekEnding|RefreshTimestamp)/, `${source === panelSource ? "MacroPanel" : "a Macro component"} must use the shared date formatters`);
  }
});

test("observationLabel supports an explicit freshness parameter and appends a visible 'Stale' qualifier -- stale data is never displayed identically to current data", () => {
  assert.match(panelSource, /freshness === "stale" \? `\$\{formatted\} · Stale` : formatted/);
  // Spot-check that real call sites actually pass freshness through, not just the function signature.
  assert.match(panelSource, /observationLabel\(storageMetric\?\.period, "weekly", storageMetric\?\.freshness\)/);
  assert.match(panelSource, /observationLabel\(lngMetric\?\.period, "monthly", lngMetric\?\.freshness\)/);
});

test("the Gas Balance module shows its own data date (Storage/LNG dates), not just a classification with no period", () => {
  assert.match(panelSource, /asOf=\{`Storage \$\{storageMetric\?\.period/);
});

test("the Regional Storage subsection shows an 'as of' date derived from real region data, not hardcoded text alone", () => {
  assert.match(panelSource, /Official EIA regions · \{east\?\.period \? formatWeekEnding\(east\.period\) : "--"\}/);
});

test("EIA STEO Outlook module and the inline STEO forecast subsections all show a STEO release/vintage date derived from the series' own fetchedAt, not hardcoded", () => {
  assert.match(outlookSource, /STEO \{formatDataDate\(snapshotMonthFrom\(series\.fetchedAt\)\)\}/);
  assert.match(panelSource, /function steoVintageLabel/);
  assert.match(panelSource, /steoVintageLabel\("workingGasStorageForecast"\)/);
  assert.match(panelSource, /steoVintageLabel\("electricPowerConsumptionForecast"\)/);
  assert.match(panelSource, /steoVintageLabel\("industrialConsumptionForecast"\)/);
});

test("the Rigs section header shows the real Baker Hughes report week, not a hardcoded date", () => {
  assert.match(panelSource, /asOf=\{formatWeekEnding\(getRigDataset\(\)\.source\.reportDate\)\}/);
});

test("the interactive energy map shows a header-level 'as of' date derived from real region/production data for the active mode", () => {
  assert.match(mapSource, /mapAsOfPeriod = mode === "storage" \? data\?\.storage\.regions\.east\?\.period : data\?\.production\.states\.PA\?\.period/);
});

test("the risk widget shows its own Macro snapshot date, derived from the deterministic engine's own data-period marker, not a fetch timestamp", () => {
  assert.match(widgetSource, /Macro snapshot: \{formatDataDate\(data\.snapshotAsOf\)\}/);
});

test("the AI summary line shows both the Macro snapshot it summarizes and its own generation time, distinctly", () => {
  assert.match(widgetSource, /Based on Macro snapshot \{formatDataDate\(data\.aiSummary\.snapshotAsOf\)\} · Generated \{formatRefreshTimestamp\(data\.aiSummary\.generatedAt\)\}/);
});

test("the risk API response carries both snapshotAsOf (deterministic data period) and lastOrchestrationAt (system refresh time) as two distinct fields, never conflated into one", () => {
  assert.match(riskRouteSource, /snapshotAsOf: string \| null;/);
  assert.match(riskRouteSource, /lastOrchestrationAt: string \| null;/);
});

test("a cached AI summary's own persisted snapshotAsOf is read back and exposed, not just its generation time -- prevents an old summary from looking like it covers current data", () => {
  assert.match(riskRouteSource, /snapshotAsOf: \(cached\.riskSignals as MacroRiskPayload\)\?\.snapshotAsOf \?\? null/);
  assert.match(riskRouteSource, /snapshotAsOf: \(previous\.riskSignals as MacroRiskPayload\)\?\.snapshotAsOf \?\? null/);
});

test("no literal hardcoded date string (e.g. a specific 'Aug 2026'-style constant) was introduced in the Phase 6E date-display code", () => {
  for (const source of [panelSource, widgetSource, outlookSource, mapSource]) {
    assert.doesNotMatch(source, /"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, 20\d{2}"/, "a literal formatted date string must never appear as a hardcoded constant");
  }
});

test("the Permian rig chart CSS fix from Phase 6C is untouched by this phase's changes", () => {
  const cssSource = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
  assert.match(cssSource, /\.basin-detail \.drilling-history \.macro-evidence-chart svg \{ height: auto; aspect-ratio: 660 \/ 220; \}/);
});

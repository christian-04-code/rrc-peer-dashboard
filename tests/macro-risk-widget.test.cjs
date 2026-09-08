const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const widgetSource = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "MacroRiskWidget.tsx"), "utf8");
const panelSource = fs.readFileSync(path.join(process.cwd(), "components", "dashboard", "MacroPanel.tsx"), "utf8");

test("renders a ranked list keyed by driver, with a visible rank number, label, and state badge per item", () => {
  assert.match(widgetSource, /data\.signals\.map\(\(signal, index\)/);
  assert.match(widgetSource, /macro-risk-rank.*index \+ 1/s);
  assert.match(widgetSource, /macro-risk-badge/);
});

test("all four real states (plus UNAVAILABLE) have distinct label text and CSS state classes -- no fake numeric score is displayed", () => {
  for (const state of ["HIGH_RISK", "MODERATE_RISK", "WATCH", "SUPPORTIVE", "UNAVAILABLE"]) {
    assert.match(widgetSource, new RegExp(`${state}:`));
  }
  assert.doesNotMatch(widgetSource, /\/100\b|score/i, "must not render a fabricated numeric score like 73.4/100");
});

test("an empty signals list renders a safe explanatory message instead of crashing or rendering nothing", () => {
  assert.match(widgetSource, /No macro driver had enough live data to classify this run/);
});

test("each item exposes source/freshness via its own metrics, and a 'View data' interaction that calls back with the driver key", () => {
  assert.match(widgetSource, /signal\.metrics\.map/);
  assert.match(widgetSource, /onViewDriver\(signal\.driver\)/);
  assert.match(widgetSource, /View \{signal\.label\} data/);
});

test("the AI summary section handles all four states distinctly: ready/stale (renders text), pending, and unavailable -- never silently blank", () => {
  assert.match(widgetSource, /aiSummaryStatus === "ready"/);
  assert.match(widgetSource, /aiSummaryStatus === "stale"/);
  assert.match(widgetSource, /has not been generated for the current data snapshot yet/);
  assert.match(widgetSource, /AI summary is currently unavailable/);
});

test("a stale AI summary is visibly labeled as based on a prior snapshot, never presented as current without qualification", () => {
  assert.match(widgetSource, /Based on a prior data snapshot/);
});

test("the 'what changed' section distinguishes 'no prior snapshot' from 'nothing changed' -- two different real states, not one conflated message", () => {
  assert.match(widgetSource, /data\.hasPriorSnapshot/);
  assert.match(widgetSource, /No driver's classification changed since the last report/);
  assert.match(widgetSource, /More history is needed to evaluate changes between report periods/);
});

test("MacroPanel wires the widget with a live data hook and a callback that switches the active topic tab (View data interaction)", () => {
  assert.match(panelSource, /useMacroRisk\(\)/);
  assert.match(panelSource, /<MacroRiskWidget data=\{macroRisk\.data\} loading=\{macroRisk\.loading\} error=\{macroRisk\.error\} onViewDriver=\{\(driver\) => setTopic\(RISK_DRIVER_TOPIC\[driver\]\)\}/);
});

test("every RangeMacroSignalKey the engine can produce has a corresponding topic-tab mapping -- a 'View data' click can never target a nonexistent tab", () => {
  const engineSource = fs.readFileSync(path.join(process.cwd(), "lib", "market", "macro-risk-engine.ts"), "utf8");
  const keyMatches = [...engineSource.matchAll(/^\s+\| "([a-z_]+)";?$/gm)].map((match) => match[1]);
  assert.ok(keyMatches.length >= 7, "expected to find the RangeMacroSignalKey union members");
  for (const key of keyMatches) {
    assert.match(panelSource, new RegExp(`${key}: "`), `RISK_DRIVER_TOPIC is missing a mapping for "${key}"`);
  }
});

test("the Permian rig chart fix survived this phase's edits -- the scoped aspect-ratio override is still present, unmodified", () => {
  const cssSource = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
  assert.match(cssSource, /\.basin-detail \.drilling-history \.macro-evidence-chart svg \{ height: auto; aspect-ratio: 660 \/ 220; \}/);
});

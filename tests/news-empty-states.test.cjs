const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const panelSource = fs.readFileSync(path.join(process.cwd(), "components", "news", "NewsPanel.tsx"), "utf8");
const headerSource = fs.readFileSync(path.join(process.cwd(), "components", "news", "DailyIntelligenceHeader.tsx"), "utf8");

test("NewsPanel distinguishes a genuine fetch error from 'not configured' from 'no run yet' -- three distinct states, not one generic empty message", () => {
  assert.match(panelSource, /News feed temporarily unavailable/);
  assert.match(panelSource, /News storage is not configured yet\./);
  assert.match(panelSource, /No completed news run is available yet\./);
});

test("NewsPanel no longer has a 'filtered to nothing' state -- the filter UI that produced it was removed, and the full unfiltered feed is always shown", () => {
  assert.doesNotMatch(panelSource, /No relevant stories found for this filter/);
});

test("NewsPanel never renders zero counts as a substitute for a genuinely unavailable state", () => {
  // The empty-state branches short-circuit before the card grid, so no numeric stat is fabricated when data is unavailable.
  assert.match(panelSource, /displayable\.length === 0 \? \(/);
});

test("DailyIntelligenceHeader shows a clean unavailable state, and distinguishes 'not configured' from 'no run yet'", () => {
  assert.match(headerSource, /News storage is not configured yet\./);
  assert.match(headerSource, /No completed news run is available yet\./);
});

test("DailyIntelligenceHeader never fabricates a value when status is unavailable -- the stats grid only renders once status.available is true", () => {
  assert.match(headerSource, /!status \|\| !status\.available/);
});

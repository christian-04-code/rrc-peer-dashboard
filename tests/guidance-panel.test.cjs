const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const { getCompanyGuidanceHighlights, getCompanyGuidanceFullText, hasGuidance } = load("lib/dashboard/guidance.ts");

const CORE_PEERS = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];

test("every core peer ticker has normalized company guidance", () => {
  for (const ticker of CORE_PEERS) {
    assert.ok(hasGuidance(ticker), `${ticker} should have guidance data`);
    const highlights = getCompanyGuidanceHighlights(ticker);
    assert.ok(highlights.length > 0, `${ticker} should have at least one guidance highlight`);
  }
});

test("guidance highlights change when the selected company changes", () => {
  const rrc = getCompanyGuidanceHighlights("RRC");
  const ar = getCompanyGuidanceHighlights("AR");
  assert.notDeepEqual(rrc, ar, "RRC and AR guidance highlights should differ");
});

test("guidance highlights use real values from the AlphaSense-sourced guidance document, not placeholder text", () => {
  const rrc = getCompanyGuidanceHighlights("RRC");
  const q1Actual = rrc.find((item) => item.label === "Q1 2026 Actual");
  assert.ok(q1Actual, "RRC Q1 2026 Actual production highlight should be present");
  assert.equal(q1Actual.value, "2.2 Bcfe/d");
});

test("guidance highlights never contain the old market-feed-status wording", () => {
  for (const ticker of CORE_PEERS) {
    const text = JSON.stringify(getCompanyGuidanceHighlights(ticker));
    assert.doesNotMatch(text, /unavailable/i);
    assert.doesNotMatch(text, /Henry Hub/i);
    assert.doesNotMatch(text, /LNG export/i);
    assert.doesNotMatch(text, /storage/i);
  }
});

test("full guidance text is non-empty for the drawer view", () => {
  const text = getCompanyGuidanceFullText("RRC");
  assert.ok(text.length > 100);
});

test("HomeDashboard renders the Guidance widget from normalized company guidance, not market-feed messages", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components", "HomeDashboard.tsx"), "utf8");
  assert.match(source, /GuidancePanel/);
  assert.doesNotMatch(source, /Daily market/);
  assert.doesNotMatch(source, /Storage unavailable|storage feed is currently unavailable/i);
  assert.doesNotMatch(source, /LNG.*unavailable/i);
});
